-- =====================================================================
-- 0083_invoice_emission.sql — liquidación v2 + máquina de estados del
-- comprobante (emisión ante SUNAT y envío por correo).
--
-- Regla que gobierna todo el diseño: LA EMISIÓN NUNCA BLOQUEA EL PAGO.
-- El usuario ya pagó; si Factiliza, SUNAT o el correo fallan, sus créditos
-- entran igual y el comprobante se reintenta por su cuenta. Por eso
-- `settle_paid_order` NO habla con nadie: crea la fila, acredita y deja el
-- comprobante en cola. El aviso al worker va envuelto en un bloque de
-- excepción, de modo que ni con pg_net caído se pierde una acreditación.
--
-- Idempotencia: el IPN de Izipay se reintenta, y emitir dos veces el mismo
-- comprobante ante SUNAT es un problema fiscal serio. Capas:
--   1) el gate atómico de 0061 (una liquidación por orden),
--   2) los índices únicos de 0082 (un comprobante por orden, un número único),
--   3) la reserva con arrendamiento de aquí (un solo worker envía a la vez),
--   4) la comprobación previa contra Factiliza antes de reenviar (en la función).
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- Secreto compartido con el worker ----------
-- La Edge Function corre sin JWT (la llama la propia base de datos), así que se
-- identifica con este secreto. Debe coincidir con el secret INVOICE_WORKER_SECRET
-- de la función. Mientras no se configure, los comprobantes se quedan en cola y
-- se ven como pendientes en el panel: nada se pierde y nada miente.
create or replace function public.invoice_worker_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.value #>> '{}' from public.system_settings s
                    where s.key = 'invoice_worker_secret'), '');
$$;

insert into public.system_settings (key, value, label) values
  ('invoice_worker_secret', '""'::jsonb,
   'Secreto compartido con la función emit-invoice (debe coincidir con su secret)')
on conflict (key) do nothing;

-- ---------- Aviso al worker, a prueba de fallos ----------
create or replace function public.dispatch_invoice_emission(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  begin
    perform net.http_post(
      url     := 'https://prhbgniwymaaevnisyov.supabase.co/functions/v1/emit-invoice',
      body    := jsonb_build_object('invoice_id', p_invoice_id),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-worker-secret', public.invoice_worker_secret())
    );
  exception when others then
    -- pg_net ausente, caído o mal configurado NO puede tumbar la acreditación
    -- de créditos: el comprobante se queda en cola y lo recoge el barrido.
    null;
  end;
end;
$$;

create or replace function public.on_invoice_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.dispatch_invoice_emission(new.id);
  return new;
end;
$$;

drop trigger if exists invoices_dispatch_emission on public.invoices;
create trigger invoices_dispatch_emission
  after insert on public.invoices
  for each row
  when (new.email_status = 'pendiente')
  execute function public.on_invoice_dispatch();

-- ---------- Liquidación v2 ----------
-- Igual que 0061 (gate atómico + comprobante + créditos), y además:
--   · guarda el desglose subtotal/IGV que exige SUNAT,
--   · marca el comprobante como 'omitido' si la emisión está apagada o sin
--     configurar, en vez de dejarlo esperando algo que no va a pasar.
create or replace function public.settle_paid_order(
  p_order_id    uuid,
  p_payment_ref text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order   public.orders%rowtype;
  v_extras  jsonb;
  v_receipt jsonb;
  v_credits numeric;
  v_detail  text;
  v_number  text;
  v_updated int;
  v_emitir  boolean;
begin
  update public.orders
     set status           = 'paid',
         payment_provider = 'izipay',
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
  v_emitir  := public.invoice_emission_enabled();

  insert into public.invoices (
    order_id, type, email, advertiser_name, doc_type, doc_number,
    factiliza_data, amount, subtotal, igv, detail,
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
    case when v_emitir then 'pendiente' else 'omitido' end::public.invoice_sunat_status,
    case when v_emitir then now() else null end,
    case when v_emitir then null
         else 'Emisión electrónica no configurada: comprobante interno' end,
    now()
  )
  returning number into v_number;

  perform public.add_credits(v_order.user_id, v_credits, v_detail, v_order.id);

  return jsonb_build_object(
    'settled',        true,
    'invoice_number', v_number,
    'credits',        v_credits,
    'user_id',        v_order.user_id
  );
end;
$$;

grant execute on function public.settle_paid_order(uuid, text) to service_role;

-- ---------- Reserva del envío a SUNAT ----------
-- Única puerta de entrada. Devuelve 0 filas si otro worker lo tiene reservado,
-- si aún no toca reintentar, o si el comprobante quedó fuera de plazo.
create or replace function public.claim_invoice_emission(
  p_invoice_id     uuid,
  p_lease_seconds  int default 300
)
returns table (
  o_id uuid, o_number text, o_serie text, o_correlativo bigint,
  o_type public.invoice_type, o_doc_type public.doc_type, o_doc_number text,
  o_advertiser_name text, o_email text, o_factiliza_data jsonb,
  o_amount numeric, o_subtotal numeric, o_igv numeric, o_detail text,
  o_attempts int, o_claim_id uuid, o_fecha_emision timestamptz, o_user_id uuid
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
         -- Se congela en el primer intento: SUNAT rechaza lo enviado fuera de
         -- plazo y re-fechar sería declarar mal la fecha de la operación.
         sunat_fecha_emision = coalesce(i.sunat_fecha_emision, now())
   where i.id = p_invoice_id
     and (
       (i.sunat_status in ('pendiente', 'error')
          and coalesce(i.sunat_next_try_at, now()) <= now())
       or (i.sunat_status = 'enviando'
          and i.sunat_claimed_at < now() - make_interval(secs => p_lease_seconds))
     )
     -- Plazo de SUNAT: pasados 3 días no se envía nunca; lo resuelve contabilidad.
     and i.issued_at > now() - interval '3 days'
  returning i.id, i.number, i.serie, i.correlativo, i.type, i.doc_type, i.doc_number,
            i.advertiser_name, i.email, i.factiliza_data,
            i.amount, i.subtotal, i.igv, i.detail,
            i.sunat_attempts, i.sunat_claim_id, i.sunat_fecha_emision,
            (select o.user_id from public.orders o where o.id = i.order_id);
end;
$$;

-- ---------- Resultado del envío ----------
-- Solo escribe quien tiene la reserva vigente: un worker cuyo arrendamiento
-- caducó (y al que otro ya relevó) no puede pisar el resultado bueno.
create or replace function public.finish_invoice_emission(
  p_invoice_id    uuid,
  p_claim_id      uuid,
  p_status        public.invoice_sunat_status,
  p_hash          text default null,
  p_cdr           jsonb default null,
  p_cdr_zip       text default null,
  p_error_code    text default null,
  p_error_message text default null,
  p_needs_review  boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update public.invoices i
     set sunat_status      = case
                               -- Tras muchos intentos fallidos se deja de insistir.
                               when p_status = 'error' and i.sunat_attempts >= 8 then 'vencido'
                               else p_status
                             end,
         sunat_hash        = coalesce(p_hash, i.sunat_hash),
         sunat_cdr         = coalesce(p_cdr, i.sunat_cdr),
         sunat_cdr_zip     = coalesce(p_cdr_zip, i.sunat_cdr_zip),
         sunat_error_code  = p_error_code,
         sunat_last_error  = p_error_message,
         needs_review      = p_needs_review,
         sunat_sent_at     = case when p_status in ('aceptado','observado')
                                  then now() else i.sunat_sent_at end,
         sunat_claim_id    = null,
         -- Espera creciente entre reintentos, con tope de una hora.
         sunat_next_try_at = case
             when p_status = 'error' and i.sunat_attempts < 8
               then now() + least(interval '1 hour',
                                  make_interval(mins => (power(3, i.sunat_attempts))::int))
             else null
           end
   where i.id = p_invoice_id
     and i.sunat_claim_id = p_claim_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- ---------- Comprobante que no se declara ----------
create or replace function public.mark_invoice_skipped(p_invoice_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.invoices
     set sunat_status     = 'omitido',
         sunat_last_error = p_reason,
         sunat_claim_id   = null,
         sunat_next_try_at = null
   where id = p_invoice_id
     and sunat_status in ('pendiente', 'error', 'enviando');
$$;

-- ---------- Bitácora ----------
create or replace function public.log_invoice_attempt(
  p_invoice_id  uuid,
  p_step        text,
  p_attempt     int,
  p_http_status int,
  p_ok          boolean,
  p_request     jsonb default null,
  p_response    jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.invoice_emission_attempts
    (invoice_id, step, attempt, http_status, ok, request, response)
  values (p_invoice_id, p_step, p_attempt, p_http_status, p_ok, p_request, p_response);
$$;

-- ---------- Reserva del correo ----------
-- Va detrás del envío fiscal: solo se manda cuando hay algo que mandar. Con la
-- emisión apagada ('omitido') se envía igual el comprobante interno.
create or replace function public.claim_invoice_email(
  p_invoice_id    uuid,
  p_lease_seconds int default 300
)
returns table (
  o_id uuid, o_number text, o_email text, o_advertiser_name text,
  o_type public.invoice_type, o_doc_type public.doc_type, o_doc_number text,
  o_amount numeric, o_subtotal numeric, o_igv numeric, o_detail text,
  o_issued_at timestamptz, o_sunat_status public.invoice_sunat_status,
  o_pdf_path text, o_xml_path text, o_attempts int, o_claim_id uuid, o_user_id uuid
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
     and i.sunat_status in ('aceptado', 'observado', 'omitido')
     and (
       (i.email_status in ('pendiente', 'error')
          and coalesce(i.email_next_try_at, now()) <= now())
       or (i.email_status = 'enviando'
          and i.email_claimed_at < now() - make_interval(secs => p_lease_seconds))
     )
  returning i.id, i.number, i.email, i.advertiser_name, i.type, i.doc_type, i.doc_number,
            i.amount, i.subtotal, i.igv, i.detail, i.issued_at, i.sunat_status,
            i.pdf_path, i.xml_path, i.email_attempts, i.email_claim_id,
            (select o.user_id from public.orders o where o.id = i.order_id);
end;
$$;

create or replace function public.finish_invoice_email(
  p_invoice_id uuid,
  p_claim_id   uuid,
  p_status     text,
  p_message_id text default null,
  p_error      text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update public.invoices i
     set email_status      = p_status,
         email_message_id  = coalesce(p_message_id, i.email_message_id),
         email_last_error  = p_error,
         email_sent_at     = case when p_status = 'enviado' then now() else i.email_sent_at end,
         email_claim_id    = null,
         email_next_try_at = case
             when p_status = 'error' and i.email_attempts < 6
               then now() + least(interval '1 hour',
                                  make_interval(mins => (power(3, i.email_attempts))::int))
             else null
           end
   where i.id = p_invoice_id
     and i.email_claim_id = p_claim_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- ---------- Reintento desde el panel ----------
create or replace function public.retry_invoice_emission(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_perm('Pagos y planes', 'edit') then
    raise exception 'no autorizado';
  end if;

  update public.invoices
     set sunat_status      = case
             when sunat_status in ('rechazado','error','omitido','enviando','vencido')
               and public.invoice_emission_enabled() then 'pendiente'
             else sunat_status end,
         sunat_next_try_at = now(),
         sunat_claim_id    = null,
         needs_review      = false,
         email_status      = case when email_status in ('error','omitido')
                                  then 'pendiente' else email_status end,
         email_next_try_at = now(),
         email_claim_id    = null
   where id = p_invoice_id;

  perform public.dispatch_invoice_emission(p_invoice_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- Barrido de rezagados ----------
-- Red de seguridad: recoge lo que el aviso directo no entregó (pg_net caído,
-- función reiniciando) y lo que espera reintento.
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
  for v_id in
    select i.id from public.invoices i
     where (i.sunat_status in ('pendiente', 'error')
              and coalesce(i.sunat_next_try_at, now()) <= now())
        or (i.sunat_status = 'enviando'
              and i.sunat_claimed_at < now() - interval '5 minutes')
        or (i.email_status in ('pendiente', 'error')
              and coalesce(i.email_next_try_at, now()) <= now()
              and i.sunat_status in ('aceptado', 'observado', 'omitido'))
     order by i.issued_at
     limit greatest(0, p_limit)
  loop
    perform public.dispatch_invoice_emission(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.claim_invoice_emission(uuid, int)   from public, anon, authenticated;
revoke execute on function public.finish_invoice_emission(uuid, uuid, public.invoice_sunat_status, text, jsonb, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.claim_invoice_email(uuid, int)      from public, anon, authenticated;
revoke execute on function public.finish_invoice_email(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.mark_invoice_skipped(uuid, text)    from public, anon, authenticated;
revoke execute on function public.log_invoice_attempt(uuid, text, int, int, boolean, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.sweep_invoice_emissions(int)        from public, anon, authenticated;
