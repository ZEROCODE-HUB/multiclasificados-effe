-- =====================================================================
-- 0051_listing_badges_on_publish.sql — Insignias del aviso al publicar
-- Al publicar, enciende featured/urgent/confidential según los adicionales
-- que el anunciante pagó (plan_extras). Solo son visuales (una insignia en
-- la tarjeta); no cambian nada más del aviso.
--
-- El trigger enforce_listing_owner_transitions impide que el dueño toque
-- featured/urgent por su cuenta; aquí se hace dentro de publish_listing, que
-- corre con app.publishing='1' y salta ese candado. Idempotente.
-- =====================================================================

create or replace function public.publish_listing(p_listing uuid, p_duration_days int)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.listings;
begin
  if p_duration_days is null or p_duration_days <= 0 or p_duration_days > 365 then
    raise exception 'Duración inválida: % días', p_duration_days
      using errcode = '22023';
  end if;

  perform set_config('app.publishing', '1', true);

  update public.listings
  set status       = 'active',
      published_at = now(),
      expires_at   = now() + (p_duration_days || ' days')::interval,
      -- Insignias pagadas: cualquier cantidad > 0 en el adicional las enciende.
      -- coalesce a '0' cubre el caso de que el adicional no venga en el jsonb.
      featured     = coalesce(plan_extras->>'destacado',   '0') not in ('0', 'false'),
      urgent       = coalesce(plan_extras->>'urgente',     '0') not in ('0', 'false'),
      confidential = coalesce(plan_extras->>'confidencial','0') not in ('0', 'false')
  where id = p_listing
    and status in ('draft', 'pending')
    and (owner_id = auth.uid() or public.is_staff(auth.uid()))
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Aviso no encontrado, ya publicado, o sin permiso'
      using errcode = '42501';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.publish_listing(uuid, int) from public;
grant  execute on function public.publish_listing(uuid, int) to authenticated, service_role;
