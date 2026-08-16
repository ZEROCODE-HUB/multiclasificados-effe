-- =====================================================================
-- 0102_aviso_de_anulacion.sql
--
-- Anular una compra dejaba al comprador sin enterarse.
--
-- Hasta aquí `anular_comprobante` le retiraba el saldo, marcaba la orden como
-- devuelta y —si el comprobante estaba declarado— emitía la nota de crédito
-- ante SUNAT. Todo eso está bien, salvo un detalle grande: **al comprador no le
-- llegaba nada**. Veía bajar su saldo sin explicación ninguna y se quedaba en
-- la bandeja de entrada con la boleta original, que ya no vale.
--
-- Y lo segundo no es solo incomodidad: la nota de crédito es un documento que
-- SUNAT espera que reciba el adquirente, igual que la boleta.
--
-- Aquí se añaden las dos piezas que faltaban:
--   1. Un aviso dentro de la aplicación en el momento de anular. Siempre, haya
--      nota o no: el saldo se retira en los dos casos.
--   2. Un ciclo de correo propio para la nota de crédito —reserva, reintentos y
--      barrido—, calcado del que ya tiene el comprobante.
--
-- Por qué el correo de la nota NO reutiliza `email_status`: ese campo guarda
-- que la boleta se envió, y devolverlo a 'pendiente' borraría ese dato y
-- dejaría el estado del comprobante mintiendo. La nota hace su propio
-- recorrido, así que lleva sus propias columnas — el mismo criterio que siguió
-- la 0101 con `nota_sunat_status`.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Dónde vive el correo de la nota ----------
-- Mismas columnas que el correo del comprobante (0082), con el prefijo `nota_`.
alter table public.invoices
  add column if not exists nota_email_status      text not null default 'pendiente',
  add column if not exists nota_email_attempts    int  not null default 0,
  add column if not exists nota_email_claim_id    uuid,
  add column if not exists nota_email_claimed_at  timestamptz,
  add column if not exists nota_email_next_try_at timestamptz,
  add column if not exists nota_email_sent_at     timestamptz,
  add column if not exists nota_email_message_id  text,
  add column if not exists nota_email_last_error  text;

do $$ begin
  alter table public.invoices
    add constraint invoices_nota_email_status_chk
    check (nota_email_status in ('pendiente','enviando','enviado','error','omitido'));
exception when duplicate_object then null;
end $$;

-- El valor por defecto 'pendiente' lo llevan TODOS los comprobantes, incluidos
-- los que nadie ha anulado. Lo que hace que eso no dispare correos fantasma es
-- que tanto la reserva como el barrido exigen además una nota ya aceptada:
-- `nota_sunat_status` es null mientras no hay anulación. Es el mismo montaje
-- que el correo del comprobante, que se apoya en `sunat_status`.
comment on column public.invoices.nota_email_status is
  'Envío al comprador de la nota de crédito que anula el comprobante. Solo '
  'entra en juego cuando nota_sunat_status es aceptado/observado.';

create index if not exists invoices_nota_email_pendiente_idx
  on public.invoices (nota_email_next_try_at)
  where nota_email_status in ('pendiente', 'error', 'enviando');

-- ---------- 2. Anular, ahora avisando ----------
-- Igual que la 0101 salvo el aviso del final.
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
  -- cumple («record is not assigned yet»). Lo cazó la prueba del caso interno.
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

  -- Avisar al usuario. Va SIEMPRE, con nota o sin ella: lo que nota es que le
  -- baja el saldo, y eso pasa en los dos casos. El correo con la nota de
  -- crédito llega después y solo si hubo nota; este aviso es inmediato.
  begin
    perform public.notify_user(
      v_user, 'invoice_voided', 'Se anuló una de tus compras',
      jsonb_build_object(
        'invoice_id',   p_invoice_id,
        'number',       v_inv.number,
        'reason',       btrim(p_motivo),
        'credits',      v_retira,
        'sin_recuperar', greatest(v_devolver - v_saldo, 0),
        'note',         v_nota_number));
  exception when others then null;   -- el aviso tampoco puede tumbar la anulación
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
    'emite_nota', v_declarado,
    'aviso_enviado', v_user is not null
  );
end;
$$;

revoke execute on function public.anular_comprobante(uuid, text, boolean) from public, anon;
grant  execute on function public.anular_comprobante(uuid, text, boolean) to authenticated;

-- ---------- 3. Reserva del correo de la nota ----------
-- La condición que importa es `nota_sunat_status in ('aceptado','observado')`:
-- solo se le manda al cliente un documento que SUNAT tiene por bueno.
--
-- Y aquí la regla es la CONTRARIA a la del comprobante. El correo de la boleta
-- sale pase lo que pase (la 0098 lo dejó así a propósito: el comprador pagó y
-- merece su papel aunque la emisión esté atascada). El de la nota no: si SUNAT
-- la rechaza, la anulación no ha surtido efecto fiscal y mandar "aquí tienes tu
-- nota de crédito" sería mandar un documento que no existe. El usuario ya se
-- enteró por el aviso in-app; el correo espera a que la nota sea válida, y si
-- nunca lo es queda `needs_review` para que lo mire un humano.
create or replace function public.claim_invoice_note_email(
  p_invoice_id    uuid,
  p_lease_seconds int default 300
)
returns table (
  o_id uuid, o_claim_id uuid, o_number text, o_nota_number text,
  o_nota_serie text, o_nota_correlativo bigint,
  o_type public.invoice_type, o_email text, o_advertiser_name text,
  o_doc_type public.doc_type, o_doc_number text,
  o_amount numeric, o_detail text, o_motivo text,
  o_credits_devueltos numeric, o_attempts int, o_es_prueba boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.invoices i
     set nota_email_status     = 'enviando',
         nota_email_claim_id   = gen_random_uuid(),
         nota_email_claimed_at = now(),
         nota_email_attempts   = i.nota_email_attempts + 1
   where i.id = p_invoice_id
     and i.email is not null and i.email <> ''
     and i.nota_number is not null
     and i.nota_sunat_status in ('aceptado', 'observado')
     and (
       (i.nota_email_status in ('pendiente', 'error')
          and coalesce(i.nota_email_next_try_at, now()) <= now())
       or (i.nota_email_status = 'enviando'
          and i.nota_email_claimed_at < now() - make_interval(secs => p_lease_seconds))
     )
  returning i.id, i.nota_email_claim_id, i.number, i.nota_number,
            i.nota_serie, i.nota_correlativo,
            i.type, i.email, i.advertiser_name,
            i.doc_type, i.doc_number,
            i.amount, i.detail, i.anulado_motivo,
            i.credits_devueltos, i.nota_email_attempts, i.es_prueba;
end;
$$;

revoke execute on function public.claim_invoice_note_email(uuid, int) from public, anon, authenticated;
grant  execute on function public.claim_invoice_note_email(uuid, int) to service_role;

create or replace function public.finish_invoice_note_email(
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
  v_max constant int := 6;
begin
  update public.invoices i
     set nota_email_status      = p_status,
         nota_email_message_id  = coalesce(p_message_id, i.nota_email_message_id),
         nota_email_last_error  = p_error,
         nota_email_sent_at     = case when p_status = 'enviado' then now()
                                       else i.nota_email_sent_at end,
         nota_email_claim_id    = null,
         nota_email_next_try_at = case
             when p_status = 'error' and i.nota_email_attempts < v_max
               then now() + least(interval '1 hour',
                                  make_interval(mins => (power(3, i.nota_email_attempts))::int))
             else null
           end
   where i.id = p_invoice_id
     and i.nota_email_claim_id = p_claim_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.finish_invoice_note_email(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant  execute on function public.finish_invoice_note_email(uuid, uuid, text, text, text)
  to service_role;

-- ---------- 4. Cerrar la nota abre su correo ----------
-- Idéntica a la 0101 salvo las dos líneas del correo: en cuanto SUNAT da la
-- nota por buena, se pone a la cola de envío. Si el propio worker la acaba de
-- emitir, la manda en la misma llamada; si no, la recoge el barrido.
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
           end,
         -- La nota ya vale: que salga hacia el comprador.
         nota_email_next_try_at = case
             when p_status in ('aceptado', 'observado')
                  and i.nota_email_status in ('pendiente', 'error') then now()
             else i.nota_email_next_try_at
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
grant execute on function public.finish_invoice_note(
  uuid, uuid, public.invoice_sunat_status, text, jsonb, text, text, boolean)
  to service_role;

-- ---------- 5. El barrido también recoge los correos de las notas ----------
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
        -- Y el correo de la nota, una vez SUNAT la dio por buena.
        or (i.nota_email_status in ('pendiente', 'error')
              and coalesce(i.nota_email_next_try_at, now()) <= now()
              and i.nota_sunat_status in ('aceptado', 'observado'))
        or (i.nota_email_status = 'enviando'
              and i.nota_email_claimed_at < now() - interval '5 minutes')
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

-- ---------- 6. El botón "reintentar" del panel alcanza también a la nota ----------
-- Antes solo destrababa el comprobante. Si lo que se atascó fue la anulación,
-- el admin no tenía ningún botón: quedaba esperar al barrido o tocar la BD.
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
         email_claim_id    = null,
         -- La nota, solo si existe: en un comprobante sin anular estas columnas
         -- tienen que seguir en null o el barrido lo recogería para siempre.
         nota_sunat_status = case
             when nota_number is not null
              and nota_sunat_status in ('rechazado','error','enviando','vencido')
               then 'pendiente' else nota_sunat_status end,
         nota_next_try_at  = case when nota_number is not null then now()
                                  else nota_next_try_at end,
         nota_claim_id     = null,
         nota_email_status = case
             when nota_number is not null and nota_email_status in ('error','omitido')
               then 'pendiente' else nota_email_status end,
         nota_email_next_try_at = case when nota_number is not null then now()
                                       else nota_email_next_try_at end,
         nota_email_claim_id    = null
   where id = p_invoice_id;

  perform public.dispatch_invoice_emission(p_invoice_id);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.retry_invoice_emission(uuid) from public, anon;
grant  execute on function public.retry_invoice_emission(uuid) to authenticated;
