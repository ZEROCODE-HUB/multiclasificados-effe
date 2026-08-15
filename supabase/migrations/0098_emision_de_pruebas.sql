-- =====================================================================
-- 0098_emision_de_pruebas.sql
--
-- Permite probar la emisión electrónica CONTRA SUNAT sin tocar a los
-- clientes reales, y cierra cuatro agujeros del circuito de comprobantes
-- que estaban dormidos solo porque la emisión seguía apagada.
--
-- El problema que resuelve
-- ------------------------
-- Factiliza ya tiene su entorno de pruebas en pie y nuestro comprobante lo
-- acepta. Pero la app está viva: hay 89 boletas reales emitidas. Si se
-- enciende la emisión "para todo el mundo" apuntando a pruebas, un cliente
-- que compra de verdad recibiría un documento SIN VALOR FISCAL, con un RUC
-- que no es el nuestro y sin declarar. Su compra sí es real.
--
-- Así que la emisión se parte en dos decisiones independientes:
--
--   invoice_emission_enabled  → interruptor maestro (ya existía)
--   invoice_emission_live     → NUEVO: permite emitir órdenes REALES
--
-- Con el maestro encendido y `live` apagado, solo se emiten las órdenes de
-- prueba. Los clientes reales siguen exactamente igual que hoy: comprobante
-- interno numerado y correo. Cero riesgo para ellos.
--
-- Y las pruebas usan SUS PROPIAS SERIES (B066/F066), así que no gastan
-- correlativos de las series reales. Un correlativo saltado hay que
-- justificarlo ante SUNAT; no se queman por hacer pruebas.
--
-- Lo demás que arregla, y por qué importa
-- ---------------------------------------
--   1. Programa el barrido. `sweep_invoice_emissions` existía desde la 0083
--      y NADIE la llamaba: todo el mecanismo de reintentos y backoff era
--      decorativo. Un envío que fallara se quedaba encolado para siempre.
--   2. El correo sale aunque SUNAT rechace. Antes, `claim_invoice_email`
--      exigía ('aceptado','observado','omitido'), así que un comprobante
--      rechazado no llegaba NUNCA a su comprador — que ya había pagado.
--   3. Marca los vencidos. El plazo era de 3 días en la base y de 5 en la
--      función, y como pasados 3 días la reserva ya no se concede, el
--      comprobante se quedaba mudo en 'pendiente' sin que nadie lo supiera.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Interruptor para emitir órdenes REALES ----------
insert into public.system_settings (key, value)
values ('invoice_emission_live', 'false'::jsonb)
on conflict (key) do nothing;

comment on table public.system_settings is
  'Ajustes globales. invoice_emission_enabled = interruptor maestro de la '
  'emisión electrónica; invoice_emission_live = además, emitir las compras '
  'REALES (no solo las de prueba). Los dos tienen que estar en true para que '
  'un cliente reciba un comprobante declarado.';

create or replace function public.invoice_emission_live()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when jsonb_typeof(value) = 'boolean' then value::text::boolean
              when jsonb_typeof(value) = 'string'  then lower(value #>> '{}') in ('true','1')
              else false
            end
       from public.system_settings where key = 'invoice_emission_live'),
    false);
$$;

revoke execute on function public.invoice_emission_live() from public, anon, authenticated;
grant  execute on function public.invoice_emission_live() to service_role;

-- ---------- 2. Series de pruebas ----------
-- Van en columnas nuevas y no en filas nuevas porque la PK de invoice_series
-- es el propio tipo de comprobante ('boleta'/'factura'): no caben dos filas
-- del mismo tipo sin rehacer la tabla.
alter table public.invoice_series
  add column if not exists serie_pruebas       text,
  add column if not exists correlativo_pruebas bigint not null default 0;

update public.invoice_series set serie_pruebas = 'B066' where id = 'boleta'  and serie_pruebas is null;
update public.invoice_series set serie_pruebas = 'F066' where id = 'factura' and serie_pruebas is null;

comment on column public.invoice_series.serie_pruebas is
  'Serie que usan las compras de prueba (la que indicó Factiliza para su QA). '
  'Separada de la real para no quemar correlativos que luego hay que justificar.';

-- ---------- 3. Marcar el comprobante como de prueba ----------
alter table public.invoices
  add column if not exists es_prueba boolean not null default false;

comment on column public.invoices.es_prueba is
  'El comprobante se generó desde una compra de prueba: va contra el entorno '
  'de pruebas de Factiliza y NO tiene valor fiscal. El PDF y el correo lo dicen.';

create index if not exists invoices_es_prueba_idx on public.invoices (es_prueba)
  where es_prueba;

-- ---------- 4. Numeración según serie real o de pruebas ----------
create or replace function public.next_invoice_number(
  p_type    public.invoice_type,
  p_pruebas boolean default false
)
returns table (o_serie text, o_correlativo bigint, o_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pruebas then
    return query
    update public.invoice_series
       set correlativo_pruebas = invoice_series.correlativo_pruebas + 1,
           updated_at          = now()
     where id = p_type
    returning coalesce(invoice_series.serie_pruebas, invoice_series.serie),
              invoice_series.correlativo_pruebas,
              coalesce(invoice_series.serie_pruebas, invoice_series.serie) || '-' ||
                lpad(invoice_series.correlativo_pruebas::text, 6, '0');
  else
    return query
    update public.invoice_series
       set correlativo = invoice_series.correlativo + 1,
           updated_at  = now()
     where id = p_type
    returning invoice_series.serie,
              invoice_series.correlativo,
              invoice_series.serie || '-' ||
                lpad(invoice_series.correlativo::text, 6, '0');
  end if;
end;
$$;

create or replace function public.set_invoice_number()
returns trigger
language plpgsql
as $$
declare
  v record;
begin
  if new.number is null or new.number = '' then
    select * into v from public.next_invoice_number(
      coalesce(new.type, 'boleta'), coalesce(new.es_prueba, false));
    new.number      := v.o_number;
    new.serie       := v.o_serie;
    new.correlativo := v.o_correlativo;
  end if;
  return new;
end;
$$;

-- ---------- 5. Liquidación: quién emite y con qué serie ----------
-- Igual que la 0096 salvo en el bloque del comprobante. Se reescribe entera
-- porque `create or replace` no admite parches.
create or replace function public.settle_paid_order(
  p_order_id    uuid,
  p_payment_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    public.orders%rowtype;
  v_extras   jsonb;
  v_receipt  jsonb;
  v_credits  numeric;
  v_detail   text;
  v_number   text;
  v_updated  int;
  v_emitir   boolean;
  v_prueba   boolean;
  v_listing  uuid;
  v_dias     int;
  v_publicado boolean := null;
  v_error    text     := null;
begin
  update public.orders
     set status           = 'paid',
         payment_provider = coalesce(payment_provider, 'izipay'),
         payment_ref      = coalesce(p_payment_ref, payment_ref),
         paid_at          = now()
   where id = p_order_id
     and status <> 'paid'
   returning * into v_order;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('settled', false);
  end if;

  v_extras  := coalesce(v_order.extras, '{}'::jsonb);
  v_receipt := coalesce(v_extras -> 'receipt', '{}'::jsonb);
  v_credits := coalesce((v_extras ->> 'credits')::numeric, 0);
  v_detail  := coalesce(v_extras ->> 'detail', 'Compra de saldo');

  -- Una compra es de prueba si la liquidó el simulador. Es el mismo convenio
  -- que ya usan los paneles (0094 y 0097) para no contar estas compras como
  -- ingresos, así que no se inventa vocabulario nuevo.
  v_prueba := coalesce(v_order.payment_ref, '') = 'SIMULADO'
              or coalesce(v_order.payment_provider, '') = 'simulado';

  -- Se emite si el interruptor maestro está encendido Y, cuando la compra es
  -- REAL, además está permitido emitir en real. Mientras `live` esté apagado,
  -- un cliente de verdad recibe su comprobante interno como hasta ahora.
  v_emitir := public.invoice_emission_enabled()
              and (v_prueba or public.invoice_emission_live());

  insert into public.invoices (
    order_id, type, email, advertiser_name, doc_type, doc_number,
    factiliza_data, amount, subtotal, igv, detail, es_prueba,
    sunat_status, sunat_next_try_at, sunat_last_error, email_next_try_at
  ) values (
    v_order.id,
    coalesce(nullif(v_receipt ->> 'receiptType', ''), 'boleta')::public.invoice_type,
    v_receipt ->> 'email',
    v_receipt ->> 'advertiserName',
    nullif(v_receipt ->> 'docType', '')::public.doc_type,
    nullif(v_receipt ->> 'docNumber', ''),
    v_receipt -> 'factilizaData',
    v_order.total,
    v_order.subtotal,
    v_order.igv,
    v_detail,
    v_prueba,
    case when v_emitir then 'pendiente' else 'omitido' end::public.invoice_sunat_status,
    case when v_emitir then now() else null end,
    case when v_emitir then null
         when v_prueba then 'Emisión apagada: comprobante de prueba interno'
         else 'Emisión electrónica no configurada: comprobante interno' end,
    now()
  )
  returning number into v_number;

  -- El saldo entra ANTES de publicar: publicar cobra el costo completo del
  -- aviso, y lo que se pagó aquí es solo la parte que faltaba.
  perform public.add_credits(v_order.user_id, v_credits, v_detail, v_order.id);

  -- ---- Orden atada a un aviso: se publica aquí mismo ----
  v_listing := nullif(v_extras ->> 'listing_id', '')::uuid;

  if v_extras ->> 'purpose' = 'publish' and v_listing is not null then
    v_dias := nullif(v_extras ->> 'duration_days', '')::int;
    begin
      perform public.effe_publish_listing(v_listing, v_dias, v_order.user_id);
      v_publicado := true;
    exception when others then
      -- Que el aviso no salga NO puede tumbar el cobro: el dinero entró, el
      -- comprobante se emitió y el saldo está acreditado. El aviso se queda en
      -- borrador y la pantalla lo remata.
      v_publicado := false;
      v_error     := sqlerrm;
    end;

    update public.orders
       set extras = coalesce(extras, '{}'::jsonb)
                    || jsonb_build_object('published', v_publicado)
                    || case when v_error is null then '{}'::jsonb
                            else jsonb_build_object('publish_error', v_error) end
     where id = v_order.id;
  end if;

  return jsonb_build_object(
    'settled', true,
    'invoice_number', v_number,
    'credits', v_credits,
    'es_prueba', v_prueba,
    'published', v_publicado
  );
end;
$$;

revoke execute on function public.settle_paid_order(uuid, text) from public, anon, authenticated;
grant  execute on function public.settle_paid_order(uuid, text) to service_role;

-- ---------- 5b. Las reservas dicen si el comprobante es de prueba ----------
-- Hace falta por comprobante y NO por entorno: mientras se apunta a pruebas,
-- las compras REALES siguen generando su comprobante interno, y a esos clientes
-- no se les puede mandar un correo que diga «documento de prueba». El aviso
-- tiene que depender de la fila, no de a qué host apunta la función.
--
-- Cambia el tipo de retorno, así que hay que soltar la función antes: un
-- `create or replace` no puede cambiarlo.
drop function if exists public.claim_invoice_emission(uuid, int);

create function public.claim_invoice_emission(
  p_invoice_id    uuid,
  p_lease_seconds int default 300
)
returns table (
  o_id uuid, o_number text, o_serie text, o_correlativo bigint,
  o_type public.invoice_type, o_doc_type public.doc_type, o_doc_number text,
  o_advertiser_name text, o_email text, o_factiliza_data jsonb,
  o_amount numeric, o_subtotal numeric, o_igv numeric, o_detail text,
  o_attempts int, o_claim_id uuid, o_fecha_emision timestamptz, o_user_id uuid,
  o_es_prueba boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.invoices i
     set sunat_status        = 'enviando',
         sunat_claim_id      = gen_random_uuid(),
         sunat_claimed_at    = now(),
         sunat_attempts      = i.sunat_attempts + 1,
         sunat_fecha_emision = coalesce(i.sunat_fecha_emision, now())
   where i.id = p_invoice_id
     and (
       (i.sunat_status in ('pendiente', 'error')
          and coalesce(i.sunat_next_try_at, now()) <= now())
       or (i.sunat_status = 'enviando'
          and i.sunat_claimed_at < now() - make_interval(secs => p_lease_seconds))
     )
     and i.issued_at > now() - interval '3 days'
  returning i.id, i.number, i.serie, i.correlativo, i.type, i.doc_type, i.doc_number,
            i.advertiser_name, i.email, i.factiliza_data,
            i.amount, i.subtotal, i.igv, i.detail,
            i.sunat_attempts, i.sunat_claim_id, i.sunat_fecha_emision,
            (select o.user_id from public.orders o where o.id = i.order_id),
            i.es_prueba;
end;
$$;

revoke execute on function public.claim_invoice_emission(uuid, int) from public, anon, authenticated;
grant  execute on function public.claim_invoice_emission(uuid, int) to service_role;

-- ---------- 6. El correo sale aunque SUNAT rechace ----------
-- Antes: sunat_status in ('aceptado','observado','omitido'). Un comprobante
-- 'rechazado' o 'vencido' es TERMINAL, así que su comprador no recibía nada
-- jamás pese a haber pagado. El PDF ya dice en qué situación está el
-- documento, así que mandarlo siempre es correcto y es lo que se debe.
drop function if exists public.claim_invoice_email(uuid, int);

create function public.claim_invoice_email(
  p_invoice_id    uuid,
  p_lease_seconds int default 300
)
returns table (
  o_id uuid, o_number text, o_email text, o_advertiser_name text,
  o_type public.invoice_type, o_doc_type public.doc_type, o_doc_number text,
  o_amount numeric, o_subtotal numeric, o_igv numeric, o_detail text,
  o_issued_at timestamptz, o_sunat_status public.invoice_sunat_status,
  o_pdf_path text, o_xml_path text, o_attempts int, o_claim_id uuid, o_user_id uuid,
  o_es_prueba boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.invoices i
     set email_status     = 'enviando',
         email_claim_id   = gen_random_uuid(),
         email_claimed_at = now(),
         email_attempts   = i.email_attempts + 1
   where i.id = p_invoice_id
     and i.email is not null and i.email <> ''
     -- Solo se espera mientras el envío a SUNAT sigue en curso: en cuanto hay
     -- desenlace —bueno o malo— el comprobante se manda.
     and i.sunat_status not in ('pendiente', 'enviando')
     and (
       (i.email_status in ('pendiente', 'error')
          and coalesce(i.email_next_try_at, now()) <= now())
       or (i.email_status = 'enviando'
          and i.email_claimed_at < now() - make_interval(secs => p_lease_seconds))
     )
  returning i.id, i.number, i.email, i.advertiser_name, i.type, i.doc_type, i.doc_number,
            i.amount, i.subtotal, i.igv, i.detail, i.issued_at, i.sunat_status,
            i.pdf_path, i.xml_path, i.email_attempts, i.email_claim_id,
            (select o.user_id from public.orders o where o.id = i.order_id),
            i.es_prueba;
end;
$$;

revoke execute on function public.claim_invoice_email(uuid, int) from public, anon, authenticated;
grant  execute on function public.claim_invoice_email(uuid, int) to service_role;

-- ---------- 7. Marcar los que se pasaron de plazo ----------
-- Pasados 3 días, `claim_invoice_emission` ya no concede la reserva, así que
-- la función nunca llegaba a marcarlos: se quedaban en 'pendiente' para
-- siempre, invisibles. Esto los saca a la luz para que contabilidad los vea.
create or replace function public.expire_stale_invoices(p_dias int default 3)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update public.invoices
     set sunat_status    = 'vencido',
         needs_review    = true,
         sunat_next_try_at = null,
         sunat_last_error = coalesce(sunat_last_error, '')
           || case when coalesce(sunat_last_error, '') = '' then '' else ' · ' end
           || 'Fuera del plazo de ' || p_dias || ' días para declararlo ante SUNAT.'
   where sunat_status in ('pendiente', 'error', 'enviando')
     and coalesce(sunat_fecha_emision, issued_at) < now() - make_interval(days => p_dias);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.expire_stale_invoices(int) from public, anon, authenticated;
grant  execute on function public.expire_stale_invoices(int) to service_role;

-- ---------- 8. Barrido: vencidos + la nueva regla del correo ----------
create or replace function public.sweep_invoice_emissions(p_limit int default 20)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_n   int := 0;
begin
  -- Primero se cierran los que ya no tienen arreglo, para no gastar intentos
  -- en ellos y para que su correo pueda salir.
  perform public.expire_stale_invoices(3);

  for v_id in
    select i.id from public.invoices i
     where (i.sunat_status in ('pendiente', 'error')
              and coalesce(i.sunat_next_try_at, now()) <= now())
        or (i.sunat_status = 'enviando'
              and i.sunat_claimed_at < now() - interval '5 minutes')
        or (i.email_status in ('pendiente', 'error')
              and coalesce(i.email_next_try_at, now()) <= now()
              and i.sunat_status not in ('pendiente', 'enviando'))
     order by i.issued_at
     limit greatest(0, p_limit)
  loop
    perform public.dispatch_invoice_emission(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.sweep_invoice_emissions(int) from public, anon, authenticated;
grant  execute on function public.sweep_invoice_emissions(int) to service_role;

-- ---------- 9. Programar el barrido ----------
-- Va en su propio bloque tolerante a fallos: si pg_cron no estuviera
-- disponible, el resto de la migración ya quedó aplicada.
do $$
begin
  perform cron.unschedule('sweep-invoice-emissions');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule(
    'sweep-invoice-emissions', '*/10 * * * *',
    $cron$ select public.sweep_invoice_emissions(20); $cron$);
exception when others then
  raise notice 'pg_cron no disponible: el barrido de comprobantes no quedó programado';
end $$;
