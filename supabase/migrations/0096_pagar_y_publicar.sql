-- =====================================================================
-- 0096_pagar_y_publicar.sql
--
-- Publicar un aviso sin saldo obligaba a un rodeo: comprar créditos en un
-- configurador aparte (volviendo a elegir cantidad, días y adicionales que ya
-- se habían elegido en el formulario) y luego publicar a mano desde Borradores.
--
-- Ahora la orden de pago puede venir ATADA a un aviso: se cobra lo que falta y,
-- en cuanto Izipay confirma, el propio servidor publica el aviso. El usuario
-- puede cerrar la app justo después de pagar; el aviso sale igual.
--
-- No se toca la cuenta del precio ni el cobro. El webhook acredita el faltante
-- y acto seguido publica, que descuenta el costo completo como siempre. En el
-- historial quedan las dos patas: un 'purchase' por lo pagado y un 'spend' por
-- lo que cuesta el aviso.
--
-- Idempotente: todo es create or replace y el gate de settle_paid_order no se
-- toca.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) El cuerpo de publish_listing, con el actor explícito.
--
-- settle_paid_order corre desde el webhook con service_role, donde auth.uid()
-- es NULL: llamar a publish_listing tal cual chocaría contra su propio control
-- de permisos. Se extrae el cuerpo entero (idéntico al de la 0091) a una
-- función interna que recibe quién publica, y publish_listing pasa a ser un
-- envoltorio que le pasa auth.uid().
--
-- OJO — quien pueda llamar a esta función publica avisos AJENOS y los cobra a
-- su dueño. Los permisos del final de este archivo son parte de la función,
-- no un adorno.
-- ---------------------------------------------------------------------
create or replace function public.effe_publish_listing(
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
  -- La duración tiene que ser una de las de la tarifa: si no, publicar 364 días
  -- costaría lo mismo que 90 y duraría cuatro veces más.
  if p_duration_days is null or p_duration_days not in (3, 7, 15, 30, 60, 90) then
    raise exception 'Duración inválida: % días', p_duration_days
      using errcode = '22023';
  end if;

  -- Quién es el dueño y si el actor puede publicarlo, ANTES de tocar nada.
  -- 'expired' se admite para renovar (EFFE-036); 'active'/'paused' no, para no
  -- regalar extensión de vigencia; 'rejected'/'sold' tampoco.
  select l.owner_id into v_owner
    from public.listings l
   where l.id = p_listing
     and l.status in ('draft', 'pending', 'expired');

  if v_owner is null
     or (v_owner is distinct from p_actor and not public.is_staff(p_actor)) then
    raise exception 'Aviso no encontrado, ya publicado, o sin permiso'
      using errcode = '42501';
  end if;

  -- El costo lo decide el SERVIDOR, a partir de la duración que se concede y de
  -- `plan_extras`, que es la misma columna de la que salen las insignias.
  v_costo := public.effe_listing_cost(p_listing, p_duration_days);

  -- Y se cobra al DUEÑO aquí mismo. Si no alcanza, la excepción tumba toda la
  -- transacción: no se publica y no se cobra.
  if v_costo > 0 then
    select uc.balance into v_balance
      from public.user_credits uc
     where uc.user_id = v_owner
       for update;

    if v_balance is null or v_balance < v_costo then
      raise exception 'Saldo insuficiente: se necesitan % créditos y hay %',
        v_costo, coalesce(v_balance, 0)
        using errcode = 'EF001';
    end if;

    update public.user_credits
       set balance = balance - v_costo, updated_at = now()
     where user_id = v_owner;

    insert into public.credit_transactions (user_id, type, credits, description, listing_id)
      values (v_owner, 'spend', -v_costo, 'Publicación de aviso', p_listing);
  end if;

  perform set_config('app.publishing', '1', true);

  update public.listings
  set status       = 'active',
      published_at = now(),
      expires_at   = now() + (p_duration_days || ' days')::interval,
      -- Insignias pagadas: cualquier cantidad > 0 en el adicional las enciende.
      featured     = coalesce(plan_extras->>'destacado',   '0') not in ('0', 'false'),
      urgent       = coalesce(plan_extras->>'urgente',     '0') not in ('0', 'false'),
      confidential = coalesce(plan_extras->>'confidencial','0') not in ('0', 'false')
  where id = p_listing
  returning * into v_row;

  return v_row;
end
$$;

-- ---------------------------------------------------------------------
-- 2) publish_listing: mismo contrato de siempre, ahora delegando.
-- ---------------------------------------------------------------------
create or replace function public.publish_listing(p_listing uuid, p_duration_days int)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.effe_publish_listing(p_listing, p_duration_days, auth.uid());
end
$$;

-- ---------------------------------------------------------------------
-- 3) Liquidación: si la orden venía atada a un aviso, se publica.
--
-- Igual que la 0083 (gate atómico + comprobante + créditos) y, al final, la
-- publicación del aviso cuando extras.purpose = 'publish'.
-- ---------------------------------------------------------------------
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
      -- borradores —ya con saldo de sobra para publicarlo de un clic— y el
      -- motivo queda anotado en la orden para poder diagnosticarlo.
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

-- ---------------------------------------------------------------------
-- 4) Permisos.
--
-- effe_publish_listing acepta un actor arbitrario: en manos del navegador
-- sería publicar avisos ajenos gratis. Solo la liquidación (service_role) la
-- llama. Las funciones SECURITY DEFINER nacen con EXECUTE para PUBLIC, así que
-- revocarlo es obligatorio y no opcional.
-- ---------------------------------------------------------------------
revoke execute on function public.effe_publish_listing(uuid, int, uuid) from public;
revoke execute on function public.effe_publish_listing(uuid, int, uuid) from anon;
revoke execute on function public.effe_publish_listing(uuid, int, uuid) from authenticated;
grant  execute on function public.effe_publish_listing(uuid, int, uuid) to service_role;

revoke execute on function public.publish_listing(uuid, int) from public;
revoke execute on function public.publish_listing(uuid, int) from anon;
grant  execute on function public.publish_listing(uuid, int) to authenticated, service_role;

revoke execute on function public.settle_paid_order(uuid, text) from public;
revoke execute on function public.settle_paid_order(uuid, text) from anon;
revoke execute on function public.settle_paid_order(uuid, text) from authenticated;
grant  execute on function public.settle_paid_order(uuid, text) to service_role;

comment on function public.effe_publish_listing(uuid, int, uuid) is
  'Publica y cobra un aviso en nombre de p_actor. INTERNA: solo service_role (la usan publish_listing y settle_paid_order).';
comment on function public.settle_paid_order(uuid, text) is
  'Liquida una orden pagada: comprobante + créditos y, si la orden venía atada a un aviso (extras.purpose=publish), lo publica.';
