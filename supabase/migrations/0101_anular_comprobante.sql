-- =====================================================================
-- 0101_anular_comprobante.sql
--
-- Anular una compra desde el panel: retirar el saldo y —si el comprobante
-- llegó a declararse— emitir la nota de crédito que lo anula ante SUNAT.
--
-- Cómo funciona una anulación, que no es obvio
-- -------------------------------------------
-- Un comprobante que SUNAT aceptó **no se borra ni se edita**. Se anula
-- emitiendo una NOTA DE CRÉDITO que lo referencia, con su propia serie y su
-- propio correlativo. Por eso aquí no hay ningún `delete`: hay un documento
-- nuevo que apunta al viejo.
--
-- Y hay dos caminos según el estado del comprobante:
--   · declarado ('aceptado' / 'observado') → se emite la nota ante SUNAT;
--   · interno ('omitido', que hoy es la mayoría) → no hay nada declarado que
--     anular, así que la anulación es solo nuestra. El saldo se devuelve igual.
--
-- Las decisiones que se tomaron, y por qué
-- ----------------------------------------
--   · **El dinero NO se devuelve por código.** La devolución del cobro se hace
--     en el panel de Izipay, a mano. Las devoluciones son raras y conviene
--     mirarlas una a una; automatizarlo sería mucho riesgo para muy poco uso.
--   · **Si el usuario ya gastó los créditos, se avisa y decide el admin.** No se
--     bloquea sin más ni se permite saldo negativo a escondidas: se le enseña
--     cuánto se va a poder retirar y cuánto se queda sin recuperar, y tiene que
--     confirmarlo explícitamente. `previsualizar_anulacion` existe para eso.
--   · La nota va en COLUMNAS de `invoices`, no en una fila nueva: el índice
--     único `invoices_order_uidx` impone un comprobante por orden, y romperlo
--     para meter la nota traería más problemas que soluciones.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Un tipo nuevo de movimiento de saldo ----------
-- 'refund' y no 'spend' con signo negativo: `get_credits_spent` suma el valor
-- absoluto de los 'spend', así que una devolución contada ahí inflaría lo
-- "gastado" por el usuario y descuadraría sus estadísticas.
alter table public.credit_transactions drop constraint if exists credit_transactions_type_check;
alter table public.credit_transactions
  add constraint credit_transactions_type_check
  check (type in ('purchase', 'spend', 'refund'));

-- ---------- 2. Series de las notas de crédito ----------
-- Mismo enfoque que las series de pruebas de la 0098: columnas y no filas,
-- porque la PK de invoice_series es el propio tipo de comprobante.
alter table public.invoice_series
  add column if not exists serie_nota                 text,
  add column if not exists correlativo_nota           bigint not null default 0,
  add column if not exists serie_nota_pruebas         text,
  add column if not exists correlativo_nota_pruebas   bigint not null default 0;

-- Series reales: BC01 para notas sobre boleta, FC01 sobre factura.
update public.invoice_series set serie_nota = 'BC01' where id = 'boleta'  and serie_nota is null;
update public.invoice_series set serie_nota = 'FC01' where id = 'factura' and serie_nota is null;
-- Series de pruebas, verificadas contra Factiliza el 2026-08-15.
update public.invoice_series set serie_nota_pruebas = 'BC66' where id = 'boleta'  and serie_nota_pruebas is null;
update public.invoice_series set serie_nota_pruebas = 'FC66' where id = 'factura' and serie_nota_pruebas is null;

create or replace function public.next_credit_note_number(
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
       set correlativo_nota_pruebas = invoice_series.correlativo_nota_pruebas + 1,
           updated_at = now()
     where id = p_type
    returning invoice_series.serie_nota_pruebas,
              invoice_series.correlativo_nota_pruebas,
              invoice_series.serie_nota_pruebas || '-' ||
                lpad(invoice_series.correlativo_nota_pruebas::text, 6, '0');
  else
    return query
    update public.invoice_series
       set correlativo_nota = invoice_series.correlativo_nota + 1,
           updated_at = now()
     where id = p_type
    returning invoice_series.serie_nota,
              invoice_series.correlativo_nota,
              invoice_series.serie_nota || '-' ||
                lpad(invoice_series.correlativo_nota::text, 6, '0');
  end if;
end;
$$;

revoke execute on function public.next_credit_note_number(public.invoice_type, boolean)
  from public, anon, authenticated;

-- ---------- 3. Dónde se guarda la anulación ----------
alter table public.invoices
  add column if not exists anulado_at         timestamptz,
  add column if not exists anulado_por        uuid,
  add column if not exists anulado_motivo     text,
  add column if not exists credits_devueltos  numeric(12,2),
  -- La nota de crédito, con su propio ciclo de envío. Reutiliza el mismo enum
  -- de estados que el comprobante: es exactamente el mismo recorrido.
  add column if not exists nota_number        text,
  add column if not exists nota_serie         text,
  add column if not exists nota_correlativo   bigint,
  add column if not exists nota_sunat_status  public.invoice_sunat_status,
  add column if not exists nota_attempts      int not null default 0,
  add column if not exists nota_claim_id      uuid,
  add column if not exists nota_claimed_at    timestamptz,
  add column if not exists nota_next_try_at   timestamptz,
  add column if not exists nota_fecha_emision timestamptz,
  add column if not exists nota_hash          text,
  add column if not exists nota_cdr           jsonb,
  add column if not exists nota_error_code    text,
  add column if not exists nota_last_error    text;

comment on column public.invoices.anulado_at is
  'Cuándo se anuló la compra. Si nota_number no es null, además se emitió una '
  'nota de crédito ante SUNAT; si es null, el comprobante era interno y la '
  'anulación es solo nuestra.';

-- Dos notas con el mismo número serían tan grave como dos boletas iguales.
create unique index if not exists invoices_nota_uidx
  on public.invoices (nota_serie, nota_correlativo)
  where nota_serie is not null;

create index if not exists invoices_nota_pendiente_idx
  on public.invoices (nota_next_try_at)
  where nota_sunat_status in ('pendiente', 'error', 'enviando');

-- ---------- 4. Qué pasaría si se anula (para que el admin lo vea ANTES) ----------
-- El encargo era explícito: que el admin sepa lo que está haciendo. Esto
-- devuelve el detalle exacto —cuánto se devuelve, cuánto saldo tiene, cuánto se
-- va a poder retirar y cuánto queda sin recuperar— para poder enseñarlo en el
-- diálogo de confirmación en vez de soltar un "¿seguro?" a ciegas.
create or replace function public.previsualizar_anulacion(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv     public.invoices%rowtype;
  v_user    uuid;
  v_saldo   numeric;
  v_retira  numeric;
begin
  if not public.has_perm('Pagos y planes', 'edit') then
    raise exception 'Sin permiso para anular comprobantes' using errcode = 'EF010';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Comprobante no encontrado' using errcode = 'EF011';
  end if;

  select o.user_id into v_user from public.orders o where o.id = v_inv.order_id;
  select coalesce(balance, 0) into v_saldo from public.user_credits where user_id = v_user;
  v_saldo := coalesce(v_saldo, 0);

  -- Se devuelve lo que se acreditó por esa compra, no el importe en soles: el
  -- producto que se vendió son créditos.
  v_retira := coalesce((select credits from public.credit_transactions
                         where order_id = v_inv.order_id and type = 'purchase' limit 1),
                       v_inv.amount);

  return jsonb_build_object(
    'invoice_id',      v_inv.id,
    'number',          v_inv.number,
    'ya_anulado',      v_inv.anulado_at is not null,
    'declarado',       v_inv.sunat_status in ('aceptado', 'observado'),
    'es_prueba',       v_inv.es_prueba,
    'emitira_nota',    v_inv.sunat_status in ('aceptado', 'observado'),
    'creditos_compra', v_retira,
    'saldo_actual',    v_saldo,
    'se_retirara',     least(v_retira, v_saldo),
    -- Lo que el usuario ya gastó y no se puede recuperar. Si es > 0, el admin
    -- tiene que confirmarlo a sabiendas.
    'sin_recuperar',   greatest(v_retira - v_saldo, 0),
    'saldo_suficiente', v_saldo >= v_retira
  );
end;
$$;

revoke execute on function public.previsualizar_anulacion(uuid) from public, anon;
grant  execute on function public.previsualizar_anulacion(uuid) to authenticated;

-- ---------- 5. Anular ----------
create or replace function public.anular_comprobante(
  p_invoice_id uuid,
  p_motivo     text,
  -- El admin ya vio en la previsualización que el usuario gastó parte del saldo
  -- y aun así quiere seguir. Sin esto, la anulación se niega.
  p_aceptar_sin_saldo boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv      public.invoices%rowtype;
  v_user     uuid;
  v_saldo    numeric;
  v_devolver numeric;
  v_retira   numeric;
  v_declarado boolean;
  -- Escalares y no un `record`: si el comprobante es interno no hay nota, y
  -- PL/pgSQL evalúa `v_nota.o_number` aunque esté dentro de un CASE que no se
  -- cumple («record is not assigned yet»). Lo cazó la prueba del caso interno,
  -- que hoy es el más frecuente.
  v_nota_number text := null;
  v_nota_serie  text := null;
  v_nota_corr   bigint := null;
  v_actor    uuid := auth.uid();
begin
  if not public.has_perm('Pagos y planes', 'edit') then
    raise exception 'Sin permiso para anular comprobantes' using errcode = 'EF010';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Hace falta un motivo para anular' using errcode = 'EF012';
  end if;

  -- Se bloquea la fila: dos anulaciones a la vez emitirían dos notas.
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Comprobante no encontrado' using errcode = 'EF011';
  end if;
  if v_inv.anulado_at is not null then
    return jsonb_build_object('anulado', false, 'motivo', 'Este comprobante ya estaba anulado');
  end if;

  select o.user_id into v_user from public.orders o where o.id = v_inv.order_id;
  select coalesce(balance, 0) into v_saldo from public.user_credits where user_id = v_user for update;
  v_saldo := coalesce(v_saldo, 0);

  v_devolver := coalesce((select credits from public.credit_transactions
                           where order_id = v_inv.order_id and type = 'purchase' limit 1),
                         v_inv.amount);
  v_retira := least(v_devolver, v_saldo);

  -- El saldo no puede quedar negativo (lo impide un CHECK de la 0035, y es lo
  -- razonable: un usuario en números rojos no podría publicar). Si no alcanza,
  -- hace falta el visto bueno explícito de quien anula.
  if v_saldo < v_devolver and not p_aceptar_sin_saldo then
    raise exception 'El usuario ya gastó parte del saldo: tiene % de %. Confirma la anulación parcial para continuar.',
      v_saldo, v_devolver using errcode = 'EF013';
  end if;

  if v_retira > 0 then
    update public.user_credits set balance = balance - v_retira, updated_at = now()
     where user_id = v_user;
    insert into public.credit_transactions (user_id, type, credits, description, order_id)
      values (v_user, 'refund', -v_retira,
              'Anulación de ' || v_inv.number || ': ' || btrim(p_motivo), v_inv.order_id);
  end if;

  v_declarado := v_inv.sunat_status in ('aceptado', 'observado');

  -- Solo se emite nota de lo que llegó a declararse. Un comprobante interno no
  -- tiene nada que anular ante SUNAT.
  if v_declarado then
    select o_number, o_serie, o_correlativo
      into v_nota_number, v_nota_serie, v_nota_corr
      from public.next_credit_note_number(v_inv.type, coalesce(v_inv.es_prueba, false));
  end if;

  update public.invoices
     set anulado_at        = now(),
         anulado_por       = v_actor,
         anulado_motivo    = btrim(p_motivo),
         credits_devueltos = v_retira,
         nota_number       = v_nota_number,
         nota_serie        = v_nota_serie,
         nota_correlativo  = v_nota_corr,
         nota_sunat_status = case when v_declarado then 'pendiente'::public.invoice_sunat_status else null end,
         nota_next_try_at  = case when v_declarado then now() else null end
   where id = p_invoice_id;

  -- La orden deja de contar como ingreso en los paneles.
  update public.orders set status = 'refunded' where id = v_inv.order_id;

  -- Anular un documento fiscal tiene que quedar registrado con nombre y apellidos.
  begin
    insert into public.audit_logs (actor_id, action, entity, entity_id, meta)
    values (v_actor, 'void_invoice', 'invoice', p_invoice_id::text,
            jsonb_build_object('number', v_inv.number, 'motivo', btrim(p_motivo),
                               'creditos_retirados', v_retira,
                               'sin_recuperar', greatest(v_devolver - v_saldo, 0),
                               'nota', v_nota_number));
  exception when others then null;   -- la bitácora nunca puede tumbar la anulación
  end;

  -- Avisar al worker para que mande la nota. Envuelto: si pg_net falla, la
  -- anulación ya está hecha y el barrido la recogerá.
  if v_declarado then
    begin
      perform public.dispatch_invoice_emission(p_invoice_id);
    exception when others then null;
    end;
  end if;

  return jsonb_build_object(
    'anulado', true,
    'number', v_inv.number,
    'nota', v_nota_number,
    'creditos_retirados', v_retira,
    'sin_recuperar', greatest(v_devolver - v_saldo, 0),
    'emite_nota', v_declarado
  );
end;
$$;

revoke execute on function public.anular_comprobante(uuid, text, boolean) from public, anon;
grant  execute on function public.anular_comprobante(uuid, text, boolean) to authenticated;

-- ---------- 6. Reserva y cierre del envío de la nota ----------
-- Calcado de claim/finish_invoice_emission (0083). Sin el plazo de 3 días: una
-- nota de crédito se emite precisamente sobre comprobantes viejos, y aplicarles
-- la ventana del comprobante haría imposible anular nada pasada esa fecha.
create or replace function public.claim_invoice_note(
  p_invoice_id    uuid,
  p_lease_seconds int default 300
)
returns table (
  o_id uuid, o_nota_serie text, o_nota_correlativo bigint,
  o_type public.invoice_type, o_afectado_number text,
  o_doc_type public.doc_type, o_doc_number text,
  o_advertiser_name text, o_email text, o_factiliza_data jsonb,
  o_amount numeric, o_subtotal numeric, o_igv numeric,
  o_motivo text, o_attempts int, o_claim_id uuid,
  o_fecha_emision timestamptz, o_es_prueba boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.invoices i
     set nota_sunat_status  = 'enviando',
         nota_claim_id      = gen_random_uuid(),
         nota_claimed_at    = now(),
         nota_attempts      = i.nota_attempts + 1,
         nota_fecha_emision = coalesce(i.nota_fecha_emision, now())
   where i.id = p_invoice_id
     and i.nota_serie is not null
     and (
       (i.nota_sunat_status in ('pendiente', 'error')
          and coalesce(i.nota_next_try_at, now()) <= now())
       or (i.nota_sunat_status = 'enviando'
          and i.nota_claimed_at < now() - make_interval(secs => p_lease_seconds))
     )
  returning i.id, i.nota_serie, i.nota_correlativo,
            i.type, i.number,
            i.doc_type, i.doc_number,
            i.advertiser_name, i.email, i.factiliza_data,
            i.amount, i.subtotal, i.igv,
            i.anulado_motivo, i.nota_attempts, i.nota_claim_id,
            i.nota_fecha_emision, i.es_prueba;
end;
$$;

revoke execute on function public.claim_invoice_note(uuid, int) from public, anon, authenticated;

create or replace function public.finish_invoice_note(
  p_invoice_id    uuid,
  p_claim_id      uuid,
  p_status        public.invoice_sunat_status,
  p_hash          text default null,
  p_cdr           jsonb default null,
  p_error_code    text default null,
  p_error_message text default null,
  p_espera        boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
  v_max constant int := 60;
begin
  update public.invoices i
     set nota_sunat_status = case
                               when p_status = 'error' and not p_espera
                                    and i.nota_attempts >= v_max then 'vencido'
                               else p_status
                             end,
         -- Igual que en el comprobante: esperar en su cola no gasta intentos.
         nota_attempts    = case when p_espera then greatest(0, i.nota_attempts - 1)
                                 else i.nota_attempts end,
         nota_hash        = coalesce(p_hash, i.nota_hash),
         nota_cdr         = coalesce(p_cdr, i.nota_cdr),
         nota_error_code  = p_error_code,
         nota_last_error  = p_error_message,
         needs_review     = case when p_status = 'rechazado' then true else i.needs_review end,
         nota_claim_id    = null,
         nota_next_try_at = case
             when p_espera then now() + interval '5 minutes'
             when p_status = 'error' and i.nota_attempts < v_max
               then now() + least(interval '1 hour',
                                  make_interval(mins => (power(3, least(i.nota_attempts, 5)))::int))
             else null
           end
   where i.id = p_invoice_id
     and i.nota_claim_id = p_claim_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.finish_invoice_note(
  uuid, uuid, public.invoice_sunat_status, text, jsonb, text, text, boolean)
  from public, anon, authenticated;

-- ---------- 7. El barrido también recoge las notas ----------
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
        -- Notas de crédito pendientes de mandar. NO pasan por
        -- expire_stale_invoices: ese plazo es el del comprobante.
        or (i.nota_sunat_status in ('pendiente', 'error')
              and coalesce(i.nota_next_try_at, now()) <= now())
        or (i.nota_sunat_status = 'enviando'
              and i.nota_claimed_at < now() - interval '5 minutes')
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

-- ---------- 8. Una orden anulada no se puede volver a liquidar ----------
-- El gate de settle_paid_order era `status <> 'paid'`, así que un IPN tardío de
-- Izipay sobre una orden ya devuelta la habría liquidado otra vez. El índice
-- único del comprobante lo habría acabado impidiendo, pero por accidente y con
-- un error feo. Mejor decirlo.
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
     and status not in ('paid', 'refunded')
   returning * into v_order;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('settled', false);
  end if;

  v_extras  := coalesce(v_order.extras, '{}'::jsonb);
  v_receipt := coalesce(v_extras -> 'receipt', '{}'::jsonb);
  v_credits := coalesce((v_extras ->> 'credits')::numeric, 0);
  v_detail  := coalesce(v_extras ->> 'detail', 'Compra de saldo');

  v_prueba := not public.app_produccion();
  v_emitir := public.invoice_emission_enabled();

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
         else 'Emisión electrónica apagada: comprobante interno' end,
    now()
  )
  returning number into v_number;

  perform public.add_credits(v_order.user_id, v_credits, v_detail, v_order.id);

  v_listing := nullif(v_extras ->> 'listing_id', '')::uuid;

  if v_extras ->> 'purpose' = 'publish' and v_listing is not null then
    v_dias := nullif(v_extras ->> 'duration_days', '')::int;
    begin
      perform public.effe_publish_listing(v_listing, v_dias, v_order.user_id);
      v_publicado := true;
    exception when others then
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
