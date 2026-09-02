-- =====================================================================
-- 0140_el_aviso_renovado_vuelve_a_avisar.sql
--
-- DOS FALLOS QUE SE TAPABAN EL UNO AL OTRO, y que juntos explican por qué el
-- cliente ve la campanita del vencimiento y luego no encuentra cómo renovar.
--
-- ── 1. Un aviso renovado (o republicado) NO VUELVE A AVISAR ──────────────
--
-- El aviso de vencimiento se manda una sola vez y se marca en el aviso:
--
--     expiry_notified_85_at   el aviso al 85 % del plan  (0133)
--     expiry_notified_at      el recordatorio de la última hora (0049)
--     expiry_notified_3d_at   el de tres días, ya en desuso (0113)
--
-- `effe_renovar_aviso` limpiaba DOS de las tres. La del 85 % se añadió después
-- (0133) y nadie volvió a esa función, así que se queda puesta para siempre:
-- **el aviso renovado nunca vuelve a advertir de su vencimiento.** Se renueva
-- una vez y a partir de ahí caduca en silencio.
--
-- `effe_publish_listing` no limpiaba ninguna, y también republica: un aviso
-- vencido que se republica arrastra las marcas de su vida anterior y tampoco
-- avisa nunca más.
--
-- ── 2. El plan que se paga al renovar no se guardaba ─────────────────────
--
-- `plan_duration_days` se quedaba con el plan ORIGINAL. Renovar 30 días un
-- aviso de plan 7 lo dejaba diciendo "plan de 7 días" con 30 por delante, y esa
-- columna es justo de la que sale el umbral del 85 % en los dos lados:
--
--     la base   → notify_expiring_listings()  (0133)
--     la app    → expiryInfo() / porVencer()  (src/lib/listings.ts)
--
-- Con la columna mintiendo, la base avisaba a destiempo y la app decidía si
-- enseñar el botón "Renovar" con la cuenta equivocada. En producción hay avisos
-- con `plan_duration_days = 7` y 7,5 días por delante: renovados, y ninguno de
-- los dos lados sabe leerlos.
--
-- ── CÓMO QUEDA ──────────────────────────────────────────────────────────
--
--   * Publicar, republicar y renovar guardan la duración QUE SE ACABA DE PAGAR.
--   * Las tres marcas se limpian en las tres operaciones: el aviso empieza su
--     nueva vigencia sin deber ningún aviso.
--   * Reparación de una vez para los que ya están vivos con las marcas puestas.
--
-- Las dos funciones se reescriben con `create or replace`, que conserva firma,
-- tipo de retorno Y PERMISOS. Nada de DROP + CREATE (ver la 0136).
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Publicar / republicar ----------
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
  -- 'expired' se admite para republicar (EFFE-036); 'active'/'paused' no, para
  -- no regalar extensión de vigencia; 'rejected'/'sold' tampoco.
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
      -- LA DURACIÓN QUE SE ACABA DE PAGAR. Sin esto, republicar 30 días un
      -- aviso cuyo plan original era de 7 lo dejaba diciendo "plan de 7 días",
      -- y de esa columna sale el umbral del 85 % en la base y en la app.
      plan_duration_days = p_duration_days,
      -- Vigencia nueva, avisos a cero. Republicar arrastraba las marcas de la
      -- vida anterior del aviso y entonces no volvía a advertir NUNCA.
      expiry_notified_85_at = null,
      expiry_notified_at    = null,
      expiry_notified_3d_at = null,
      -- Insignias pagadas: cualquier cantidad > 0 en el adicional las enciende.
      featured     = coalesce(plan_extras->>'destacado',   '0') not in ('0', 'false'),
      urgent       = coalesce(plan_extras->>'urgente',     '0') not in ('0', 'false'),
      confidential = coalesce(plan_extras->>'confidencial','0') not in ('0', 'false')
  where id = p_listing
  returning * into v_row;

  return v_row;
end
$$;

-- ---------- 2. Renovar ----------
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
      -- `published_at` NO se toca, a propósito (ver la 0113): si se moviera,
      -- renovar sería la forma barata de volver a encabezar "recientes" y quien
      -- renueva cada semana enterraría a quien publica por primera vez.
      --
      -- La duración SÍ, y es lo que faltaba: el umbral del 85 % se mide sobre
      -- el último plan pagado, no sobre el que se contrató la primera vez.
      plan_duration_days = p_duration_days,
      -- Las TRES marcas. La del 85 % es la que faltaba desde la 0133 y es la
      -- que de verdad avisa: sin limpiarla, un aviso renovado no volvía a
      -- advertir de su vencimiento en toda su vida.
      expiry_notified_85_at = null,
      expiry_notified_at    = null,
      expiry_notified_3d_at = null,
      featured     = coalesce(plan_extras->>'destacado',   '0') not in ('0', 'false'),
      urgent       = coalesce(plan_extras->>'urgente',     '0') not in ('0', 'false'),
      confidential = coalesce(plan_extras->>'confidencial','0') not in ('0', 'false')
  where id = p_listing
  returning * into v_row;

  return v_row;
end
$$;

-- ---------- 3. Los que ya están vivos con la marca puesta ----------
-- Un aviso al que le queda MÁS tiempo del que su plan permite (señal de que se
-- renovó o se republicó) tiene la marca puesta de una vigencia que ya no es la
-- suya. Se limpia para que el cron lo vuelva a evaluar con la regla de siempre;
-- si de verdad está al 85 %, avisará en la próxima pasada.
--
-- Acotado a los ACTIVOS y a los que aún tienen margen: a uno que vence dentro
-- de una hora no se le reabre el aviso del 85 %, que llegaría tarde y de más.
update public.listings
   set expiry_notified_85_at = null,
       expiry_notified_at    = null,
       expiry_notified_3d_at = null
 where status = 'active'
   and expires_at is not null
   and expires_at > now() + interval '1 day'
   and (expiry_notified_85_at is not null
     or expiry_notified_at    is not null
     or expiry_notified_3d_at is not null)
   -- Solo donde la marca no cuadra con el plan: si le queda más del 15 % del
   -- plan, el aviso del 85 % que tiene puesto es de una vigencia anterior.
   and plan_duration_days is not null
   and expires_at - now() > (plan_duration_days || ' days')::interval * 0.15;

comment on function public.effe_renovar_aviso(uuid, int, uuid) is
  'Renueva un aviso sumando días a su vigencia. Conserva published_at (para no '
  'regalar el primer puesto de "recientes"), guarda la duración recién pagada '
  'en plan_duration_days y limpia las tres marcas de aviso de vencimiento.';

comment on function public.effe_publish_listing(uuid, int, uuid) is
  'Publica un borrador o republica un aviso vencido: cobra, activa, guarda la '
  'duración pagada en plan_duration_days y limpia las marcas de vencimiento.';
