-- =====================================================================
-- 0113_renovar_el_aviso.sql — un aviso a punto de vencer se puede renovar sin
-- perder lo que ya tiene.
--
-- Hasta hoy la única forma de alargar un aviso era esperar a que venciera y
-- volver a publicarlo (0072). Eso significa dejarlo caer: mientras está vencido
-- no lo ve nadie, y quien lo tenía en favoritos pierde el enlace. Y `publish_
-- listing` bloquea a propósito los avisos 'active', para no regalar vigencia.
--
-- Esta migración añade la hermana que faltaba, `effe_renovar_aviso`, con dos
-- decisiones que la hacen justa:
--
--   1. Los días se SUMAN a lo que le quede:
--         expires_at = greatest(expires_at, now()) + N días
--      Renovar cuatro días antes de vencer no tira esos cuatro días a la basura.
--      Eso es lo que desactiva la objeción original de "extensión gratis": aquí
--      se paga el paquete entero, con el mismo `effe_listing_cost` de siempre.
--
--   2. `published_at` NO se toca. Si se moviera, renovar sería la forma barata
--      de volver a encabezar el orden "recientes" del buscador, y el que renueva
--      cada semana enterraría a quien publica por primera vez.
--
-- Además, el aviso de "está por vencer" pasa a mandarse también CON TRES DÍAS de
-- antelación. La 0049 solo avisaba una hora antes, aunque el texto de la app ya
-- decía "vence en X días": una hora no da tiempo a decidir nada.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- 1. Renovar ----------
create or replace function public.effe_renovar_aviso(
  p_listing       uuid,
  p_duration_days int,
  p_actor         uuid
)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.listings;
  v_owner   uuid;
  v_costo   numeric;
  v_balance numeric;
begin
  if p_duration_days is null or p_duration_days not in (3, 7, 15, 30, 60, 90) then
    raise exception 'Duración inválida: % días', p_duration_days using errcode = '22023';
  end if;

  -- Solo lo que está vivo o recién vencido. Un borrador se PUBLICA (que es otra
  -- función); un aviso rechazado o vendido no se renueva.
  select l.owner_id into v_owner
    from public.listings l
   where l.id = p_listing
     and l.status in ('active', 'expired');

  if v_owner is null
     or (v_owner is distinct from p_actor and not public.is_staff(p_actor)) then
    raise exception 'Aviso no encontrado, no renovable, o sin permiso' using errcode = '42501';
  end if;

  -- Mismo motor de precios que publicar: si divergieran, renovar sería una vía
  -- para pagar menos por lo mismo.
  v_costo := public.effe_listing_cost(p_listing, p_duration_days);

  if v_costo > 0 then
    select uc.balance into v_balance
      from public.user_credits uc
     where uc.user_id = v_owner
       for update;

    if v_balance is null or v_balance < v_costo then
      raise exception 'Saldo insuficiente: se necesitan % créditos y hay %',
        v_costo, coalesce(v_balance, 0) using errcode = 'EF001';
    end if;

    update public.user_credits
       set balance = balance - v_costo, updated_at = now()
     where user_id = v_owner;

    insert into public.credit_transactions (user_id, type, credits, description, listing_id)
      values (v_owner, 'spend', -v_costo, 'Renovación de aviso', p_listing);
  end if;

  perform set_config('app.publishing', '1', true);

  update public.listings
  set status       = 'active',
      -- Se SUMAN los días. `greatest(..., now())` evita que un aviso vencido
      -- hace un mes arranque con un mes de retraso.
      expires_at   = greatest(coalesce(expires_at, now()), now()) + (p_duration_days || ' days')::interval,
      -- Vuelve a poder avisarse de su próximo vencimiento.
      expiry_notified_at = null,
      expiry_notified_3d_at = null,
      featured     = coalesce(plan_extras->>'destacado',   '0') not in ('0', 'false'),
      urgent       = coalesce(plan_extras->>'urgente',     '0') not in ('0', 'false'),
      confidential = coalesce(plan_extras->>'confidencial','0') not in ('0', 'false')
  where id = p_listing
  returning * into v_row;

  return v_row;
end
$$;

-- Envoltorio para el navegador: el actor es quien está en sesión y no se puede
-- suplantar.
create or replace function public.renovar_aviso(p_listing uuid, p_duration_days int)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.effe_renovar_aviso(p_listing, p_duration_days, auth.uid());
end
$$;

-- ---------- 2. Aviso con tres días de antelación ----------
alter table public.listings add column if not exists expiry_notified_3d_at timestamptz;

comment on column public.listings.expiry_notified_3d_at is
  'Cuándo se avisó de que faltaban 3 días para vencer. Independiente de '
  'expiry_notified_at, que es el aviso de la última hora.';

create or replace function public.notify_expiring_listings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count int := 0;
begin
  -- (a) Tres días antes: da tiempo a decidir si se renueva.
  for v_row in
    select id, owner_id, title, expires_at
    from public.listings
    where status = 'active'
      and expires_at is not null
      and expiry_notified_3d_at is null
      and expires_at > now()
      and expires_at <= now() + interval '3 days'
  loop
    perform public.notify_user(
      v_row.owner_id,
      'listing_expiring',
      'Tu aviso está por vencer',
      jsonb_build_object(
        'listing_id', v_row.id,
        'listing_title', v_row.title,
        'expires_at', v_row.expires_at,
        'dias', greatest(1, ceil(extract(epoch from (v_row.expires_at - now())) / 86400)::int)
      )
    );
    update public.listings set expiry_notified_3d_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  -- (b) Última hora: el recordatorio de siempre, para quien no reaccionó.
  for v_row in
    select id, owner_id, title, expires_at
    from public.listings
    where status = 'active'
      and expires_at is not null
      and expiry_notified_at is null
      and expires_at > now()
      and expires_at <= now() + interval '1 hour'
  loop
    perform public.notify_user(
      v_row.owner_id,
      'listing_expiring',
      'Tu aviso está por vencer',
      jsonb_build_object(
        'listing_id', v_row.id,
        'listing_title', v_row.title,
        'expires_at', v_row.expires_at
      )
    );
    update public.listings set expiry_notified_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------- 3. Pagar y renovar ----------
-- `settle_paid_order` se recrea entera sobre la versión de la 0111, añadiendo el
-- propósito 'renew'. Con esto, quien no tiene saldo puede pagar el faltante y el
-- servidor renueva solo, igual que ya hacía al publicar.
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
  v_listing  uuid;
  v_dias     int;
  v_purpose  text;
  v_publicado boolean := null;
  v_error    text     := null;
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
    order_id, type, email, advertiser_name, doc_type, doc_number, pais,
    factiliza_data, amount, subtotal, igv, detail,
    sunat_status, sunat_next_try_at, sunat_last_error, email_next_try_at
  ) values (
    v_order.id,
    coalesce(nullif(v_receipt ->> 'receiptType', ''), 'boleta')::public.invoice_type,
    v_receipt ->> 'email',
    v_receipt ->> 'advertiserName',
    nullif(v_receipt ->> 'docType', '')::public.doc_type,
    nullif(v_receipt ->> 'docNumber', ''),
    upper(coalesce(nullif(v_receipt ->> 'country', ''), 'PE')),
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

  -- El saldo entra ANTES de publicar/renovar: esas operaciones cobran el costo
  -- completo, y lo que se pagó aquí es solo la parte que faltaba.
  perform public.add_credits(v_order.user_id, v_credits, v_detail, v_order.id);

  -- ---- Orden atada a un aviso ----
  v_listing := nullif(v_extras ->> 'listing_id', '')::uuid;
  v_purpose := v_extras ->> 'purpose';

  if v_purpose in ('publish', 'renew') and v_listing is not null then
    v_dias := nullif(v_extras ->> 'duration_days', '')::int;
    begin
      if v_purpose = 'renew' then
        perform public.effe_renovar_aviso(v_listing, v_dias, v_order.user_id);
      else
        perform public.effe_publish_listing(v_listing, v_dias, v_order.user_id);
      end if;
      v_publicado := true;
    exception when others then
      -- Que el aviso no salga NO puede tumbar el cobro: el dinero entró, el
      -- comprobante se emitió y el saldo está acreditado.
      v_publicado := false;
      v_error     := sqlerrm;
    end;

    update public.orders
       set extras = extras || jsonb_build_object(
             'published',     v_publicado,
             'publish_error', v_error)
     where id = v_order.id;
  end if;

  return jsonb_build_object(
    'settled',        true,
    'invoice_number', v_number,
    'credits',        v_credits,
    'user_id',        v_order.user_id,
    'listing_id',     v_listing,
    'published',      v_publicado
  );
end;
$$;

-- ---------- 4. Permisos ----------
-- effe_renovar_aviso acepta un actor arbitrario: en manos del navegador sería
-- renovar avisos ajenos cobrándoselos a su dueño.
revoke execute on function public.effe_renovar_aviso(uuid, int, uuid) from public;
revoke execute on function public.effe_renovar_aviso(uuid, int, uuid) from anon;
revoke execute on function public.effe_renovar_aviso(uuid, int, uuid) from authenticated;
grant  execute on function public.effe_renovar_aviso(uuid, int, uuid) to service_role;

revoke execute on function public.renovar_aviso(uuid, int) from public;
revoke execute on function public.renovar_aviso(uuid, int) from anon;
grant  execute on function public.renovar_aviso(uuid, int) to authenticated, service_role;

revoke execute on function public.settle_paid_order(uuid, text) from public;
revoke execute on function public.settle_paid_order(uuid, text) from anon;
revoke execute on function public.settle_paid_order(uuid, text) from authenticated;
grant  execute on function public.settle_paid_order(uuid, text) to service_role;

revoke execute on function public.notify_expiring_listings() from public;
revoke execute on function public.notify_expiring_listings() from anon;
revoke execute on function public.notify_expiring_listings() from authenticated;
grant  execute on function public.notify_expiring_listings() to service_role;
