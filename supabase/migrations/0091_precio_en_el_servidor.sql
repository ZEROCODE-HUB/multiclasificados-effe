-- =====================================================================
-- 0091 — El precio de publicar lo calcula y lo cobra el SERVIDOR.
--
-- Hasta ahora publicar eran dos llamadas sueltas desde el navegador:
--
--     publish_listing(aviso, 90)      -- solo miraba que 90 estuviera en 1..365
--     spend_credits(yo, 0.01, aviso)  -- aceptaba CUALQUIER importe
--
-- `spend_credits` (0071) comprueba que gastas TUS créditos y que te alcanza,
-- pero nunca que el importe corresponda al aviso. Es decir: un usuario con
-- sesión podía publicar 90 días con insignias y descontarse un céntimo. O no
-- llamar a `spend_credits` en absoluto, porque el aviso ya estaba publicado.
-- (Que el problema también se da SIN mala fe lo demuestra que el cliente tenía
-- una vía de recuperación para "aviso publicado al que le faltó el cobro".)
--
-- Desde el 2026-08-12 los adicionales se cobran POR DÍA, con lo que un aviso
-- largo con insignias vale mucho más que antes y saltarse el cobro sale mucho
-- más a cuenta. Así que se cierra:
--
--   1. Se replica el motor de precios en SQL (mismos redondeos que el de
--      TypeScript; la paridad la ancla src/test/migration0091.test.ts).
--   2. `publish_listing` calcula el costo y lo cobra en la MISMA transacción.
--      Sin saldo no se publica NI se cobra: antes podía publicarse sin cobrar.
--   3. `spend_credits` deja de ser invocable por `authenticated`, que es lo que
--      cierra el agujero de verdad. Ya no le queda ningún llamador legítimo.
--
-- La clave de que esto sea sólido: el costo sale de `plan_extras`, que es la
-- MISMA columna de la que ya salían las insignias (0051). Quien la vacíe para
-- no pagar se queda sin insignias.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Redondeo. Espeja EXACTAMENTE `Math.round(x * 100) / 100` de JavaScript.
--
-- No vale `round(x::numeric, 2)`: con 16.135, JS da 16.13 (porque 16.135*100 en
-- coma flotante es 1613.4999999999998) y el numeric de Postgres daría 16.14. Un
-- céntimo de diferencia entre lo que ve el usuario y lo que se le cobra es
-- justo lo que haría fallar la publicación.
-- ---------------------------------------------------------------------
create or replace function public.effe_round2(p double precision)
returns numeric
language sql
immutable
as $$ select round((p * 100)::numeric, 0) / 100 $$;

-- Espeja `Number(v) || 0` de JavaScript: true→1, false→0, número→número,
-- ausente/nulo/texto no numérico→0. Sin esto, un texto raro en `plan_extras`
-- reventaría el cobro en vez de contar como cero.
create or replace function public.effe_num(v jsonb)
returns double precision
language sql
immutable
as $$
  select case
    when v is null                    then 0
    when jsonb_typeof(v) = 'boolean'  then case when (v #>> '{}')::boolean then 1 else 0 end
    when jsonb_typeof(v) = 'number'   then (v #>> '{}')::double precision
    when jsonb_typeof(v) = 'string'
      and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v #>> '{}')::double precision
    else 0
  end
$$;

-- ---------------------------------------------------------------------
-- La tarifa vigente, ya fusionada con los valores por defecto del código.
-- Espeja `settingsFromRow` de supabase/functions/_shared/pricing.ts y
-- `loadSettings` de src/lib/pricing.ts: la fila de la BD pisa clave a clave los
-- valores por defecto, y si no hay fila se usan estos enteros.
-- ---------------------------------------------------------------------
create or replace function public.effe_pricing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'base',         coalesce(p.base::double precision, 16.14),
        'descPorAviso', coalesce(p.desc_por_aviso::double precision, 0.06),
        'descCantidad', case
                          when jsonb_typeof(p.desc_cantidad) = 'array'
                           and jsonb_array_length(p.desc_cantidad) > 0
                          then p.desc_cantidad
                        end,
        'saltos',       '{"15":0.14,"30":0.13,"60":0.12,"90":0.11}'::jsonb
                          || coalesce(p.saltos, '{}'::jsonb),
        'extras',       '{"img100":0,"img500":5,"pdf100":0,"pdf500":5,
                          "urgente":5,"destacado":5,"confidencial":0}'::jsonb
                          || coalesce(p.extras, '{}'::jsonb)
      )
      from public.pricing_settings p
      where p.is_active
      order by p.updated_at desc nulls last
      limit 1
    ),
    '{"base":16.14,"descPorAviso":0.06,
      "descCantidad":[0,0,0.06,0.06,0.06,0.06,0.06,0.06,0.06,0.06,0.06],
      "saltos":{"15":0.14,"30":0.13,"60":0.12,"90":0.11},
      "extras":{"img100":0,"img500":5,"pdf100":0,"pdf500":5,
                "urgente":5,"destacado":5,"confidencial":0}}'::jsonb
  );
$$;

-- ---------------------------------------------------------------------
-- Precio del paquete de n avisos por `dias`. Espeja `priceFor`.
-- El total crece con la cantidad, pero el precio POR aviso baja por volumen; y
-- cada rango de días duplica al anterior (el de 90 va ×1.5) con su descuento.
-- ---------------------------------------------------------------------
create or replace function public.effe_price_for(p_n int, p_dias int, p_cfg jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  v_price  double precision;
  v_vol    double precision := 1;
  v_dc     jsonb := p_cfg -> 'descCantidad';
  v_saltos jsonb := p_cfg -> 'saltos';
  v_dpa    double precision := (p_cfg ->> 'descPorAviso')::double precision;
  k int;
begin
  v_price := (p_cfg ->> 'base')::double precision * p_n;

  if v_dc is not null and jsonb_typeof(v_dc) = 'array' and jsonb_array_length(v_dc) > 0 then
    for k in 2 .. p_n loop
      v_vol := v_vol * (1 - coalesce((v_dc ->> k)::double precision, v_dpa));
    end loop;
    v_price := v_price * v_vol;
  else
    v_price := v_price * power(1 - v_dpa, greatest(0, p_n - 1));
  end if;

  if p_dias >= 15 then v_price := v_price * 2::double precision   * (1 - (v_saltos ->> '15')::double precision); end if;
  if p_dias >= 30 then v_price := v_price * 2::double precision   * (1 - (v_saltos ->> '30')::double precision); end if;
  if p_dias >= 60 then v_price := v_price * 2::double precision   * (1 - (v_saltos ->> '60')::double precision); end if;
  if p_dias >= 90 then v_price := v_price * 1.5::double precision * (1 - (v_saltos ->> '90')::double precision); end if;

  return public.effe_round2(v_price);
end
$$;

-- Precio del aviso según duración. Espeja `priceForDuration`: los 3 días son la
-- única duración proporcional (3/7 del precio de 7 días).
create or replace function public.effe_price_for_duration(p_n int, p_dias int, p_cfg jsonb)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_dias = 3 then
    return public.effe_round2(public.effe_price_for(p_n, 7, p_cfg)::double precision * 3 / 7);
  end if;
  return public.effe_price_for(p_n, p_dias, p_cfg);
end
$$;

-- ---------------------------------------------------------------------
-- Adicionales. Espeja `extrasTotal`: precio × cantidad × DÍAS PUBLICADOS.
-- Se recorre la TARIFA y no la selección, así que una clave que no exista en la
-- tarifa se ignora — igual que en el cliente.
-- ---------------------------------------------------------------------
create or replace function public.effe_extras_total(p_extras jsonb, p_dias int, p_cfg jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  v_tarifa jsonb := p_cfg -> 'extras';
  v_total  double precision := 0;
  k text;
begin
  for k in select jsonb_object_keys(v_tarifa) loop
    v_total := v_total
             + (v_tarifa ->> k)::double precision
             * public.effe_num(p_extras -> k)
             * p_dias;
  end loop;
  return public.effe_round2(v_total);
end
$$;

-- ---------------------------------------------------------------------
-- Promociones. Espeja `fetchActivePromotions` + `bestPromoForCategory`: de las
-- vigentes que apliquen a la categoría (sin categorías = todas), la de mayor
-- descuento.
-- ---------------------------------------------------------------------
create or replace function public.effe_promo_pct(p_category text)
returns double precision
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(pr.discount_pct)::double precision, 0)
  from public.promotions pr
  where pr.is_active
    and pr.starts_at <= now()
    and pr.ends_at   >= now()
    and (cardinality(pr.category_ids) = 0 or p_category = any (pr.category_ids));
$$;

-- Espeja `applyDiscount` de src/lib/promotions.ts.
create or replace function public.effe_apply_discount(p_cost double precision, p_pct double precision)
returns numeric
language sql
immutable
as $$
  select public.effe_round2(p_cost * (1 - least(100, greatest(0, p_pct)) / 100));
$$;

-- ---------------------------------------------------------------------
-- Lo que cuesta publicar ESTE aviso durante ESTOS días. Es la misma cuenta que
-- hace la pantalla de publicar: aviso + adicionales, y encima la promoción
-- vigente de su categoría.
-- ---------------------------------------------------------------------
create or replace function public.effe_listing_cost(p_listing uuid, p_dias int)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg    jsonb := public.effe_pricing();
  v_qty    int;
  v_extras jsonb;
  v_cat    text;
  v_base   numeric;
  v_add    numeric;
begin
  select greatest(1, coalesce(l.plan_quantity, 1)),
         coalesce(l.plan_extras, '{}'::jsonb),
         l.category_id
    into v_qty, v_extras, v_cat
    from public.listings l
   where l.id = p_listing;

  if v_qty is null then
    raise exception 'Aviso no encontrado' using errcode = '42501';
  end if;

  v_base := public.effe_price_for_duration(v_qty, p_dias, v_cfg);
  v_add  := public.effe_extras_total(v_extras, p_dias, v_cfg);

  -- Los dos sumandos ya vienen a dos decimales, así que la suma es exacta.
  return public.effe_apply_discount((v_base + v_add)::double precision,
                                    public.effe_promo_pct(v_cat));
end
$$;

-- ---------------------------------------------------------------------
-- Publicar: ahora también COBRA, en la misma transacción.
-- ---------------------------------------------------------------------
create or replace function public.publish_listing(p_listing uuid, p_duration_days int)
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
  -- La duración ya no es "cualquier número entre 1 y 365": tiene que ser una de
  -- las de la tarifa. Si no, publicar 364 días costaba lo mismo que 90 (la
  -- fórmula aplica todos los escalones a partir de 90) pero duraba cuatro veces
  -- más.
  if p_duration_days is null or p_duration_days not in (3, 7, 15, 30, 60, 90) then
    raise exception 'Duración inválida: % días', p_duration_days
      using errcode = '22023';
  end if;

  -- Quién es el dueño y si quien llama puede publicarlo, ANTES de tocar nada.
  -- 'expired' se admite para renovar (EFFE-036); 'active'/'paused' no, para no
  -- regalar extensión de vigencia; 'rejected'/'sold' tampoco.
  select l.owner_id into v_owner
    from public.listings l
   where l.id = p_listing
     and l.status in ('draft', 'pending', 'expired');

  if v_owner is null
     or (v_owner is distinct from auth.uid() and not public.is_staff(auth.uid())) then
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
-- Permisos.
-- ---------------------------------------------------------------------
revoke execute on function public.publish_listing(uuid, int) from public;
grant  execute on function public.publish_listing(uuid, int) to authenticated, service_role;

-- `spend_credits` era la puerta por la que el cliente decidía cuánto pagar. Ya
-- no le queda ningún llamador legítimo: publicar cobra solo. Se conserva la
-- función (settle_paid_order y las herramientas de administración corren con
-- privilegios propios) pero deja de ser invocable desde el navegador.
revoke execute on function public.spend_credits(uuid, numeric, uuid, text) from public;
revoke execute on function public.spend_credits(uuid, numeric, uuid, text) from anon;
revoke execute on function public.spend_credits(uuid, numeric, uuid, text) from authenticated;

-- Las de precio son de solo lectura y las usa la pantalla para enseñar el
-- costo antes de publicar; no exponen nada que no esté ya en pricing_settings,
-- que es de lectura pública.
grant execute on function public.effe_pricing()                              to authenticated, anon, service_role;
grant execute on function public.effe_price_for(int, int, jsonb)             to authenticated, anon, service_role;
grant execute on function public.effe_price_for_duration(int, int, jsonb)    to authenticated, anon, service_role;
grant execute on function public.effe_extras_total(jsonb, int, jsonb)        to authenticated, anon, service_role;
grant execute on function public.effe_promo_pct(text)                        to authenticated, anon, service_role;
grant execute on function public.effe_apply_discount(double precision, double precision) to authenticated, anon, service_role;
grant execute on function public.effe_listing_cost(uuid, int)                to authenticated, service_role;

comment on function public.publish_listing(uuid, int) is
  'Publica un aviso Y cobra su costo (calculado en el servidor) en la misma transacción. Sin saldo, ni publica ni cobra.';
comment on function public.effe_listing_cost(uuid, int) is
  'Costo de publicar un aviso: paquete + adicionales POR DÍA, menos la promoción vigente de su categoría.';
