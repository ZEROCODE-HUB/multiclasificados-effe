-- =====================================================================
-- EFFE-036 — Republicar / renovar un aviso VENCIDO.
--
-- Hasta ahora `publish_listing` (0051) solo aceptaba avisos en 'draft'/'pending'
-- (0042 lo cerró así para impedir que re-publicar un aviso ACTIVO reescribiera
-- `expires_at` gratis). Un aviso ya 'expired' NO tiene ese riesgo: su vigencia
-- terminó, así que volverlo a publicar es un alta nueva legítima (el cliente
-- vuelve a descontar saldo con spend_credits, igual que en una publicación
-- normal). Añadimos 'expired' al conjunto permitido.
--
-- NO se aceptan 'active'/'paused' (extensión gratis) ni 'rejected' (saltaría la
-- moderación) ni 'sold'. La comprobación de propiedad sigue siendo explícita
-- (la función es SECURITY DEFINER y salta RLS). Idempotente (create or replace).
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
    -- 'expired' habilitado para EFFE-036 (renovar). 'active'/'paused' NO, para no
    -- regalar extensión de vigencia; 'rejected'/'sold' tampoco.
    and status in ('draft', 'pending', 'expired')
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
