-- =====================================================================
-- 0064_listing_status_matrix.sql
-- El overload de 3 argumentos de admin_set_listing_status (definido en 0032)
-- seguía protegido por is_staff(), no por la matriz. Como el cliente llama
-- SIEMPRE a esa firma de 3 args (p_listing, p_status, p_reason), "deshabilitar
-- / rehabilitar un aviso" desde el panel NO respetaba el toggle "Moderar" de
-- Roles y permisos (solo destacar, vía admin_toggle_featured, sí lo hacía).
--
-- 0046 puso el has_perm en el overload de 2 args, que el cliente no invoca; esta
-- migración lo alinea en la firma que sí se usa. Mismo cuerpo que 0032 (aviso al
-- dueño + auditoría); solo cambia el guard is_staff → has_perm('Gestión de
-- avisos','edit'). has_perm ya devuelve true para el superadmin. Idempotente.
-- =====================================================================

create or replace function public.admin_set_listing_status(
  p_listing uuid,
  p_status  public.listing_status,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_title text;
begin
  if not public.has_perm('Gestión de avisos', 'edit') then
    raise exception 'no autorizado';
  end if;

  update public.listings
  set status = p_status,
      rejection_reason = case
        when p_status = 'rejected' then coalesce(p_reason, rejection_reason)
        when p_status = 'active'   then null
        else rejection_reason
      end
  where id = p_listing
  returning owner_id, title into v_owner, v_title;

  perform public.log_audit('set_listing_status', 'listing', p_listing::text,
                           jsonb_build_object('status', p_status, 'reason', p_reason));

  -- Aviso al dueño: deshabilitado (con motivo) o habilitado de nuevo.
  if p_status = 'rejected' then
    perform public.notify_user(
      v_owner, 'listing_disabled', 'Tu aviso fue deshabilitado',
      jsonb_build_object('listing_id', p_listing, 'listing_title', v_title, 'reason', p_reason)
    );
  elsif p_status = 'active' then
    perform public.notify_user(
      v_owner, 'listing_enabled', 'Tu aviso fue habilitado',
      jsonb_build_object('listing_id', p_listing, 'listing_title', v_title)
    );
  end if;
end;
$$;

grant execute on function public.admin_set_listing_status(uuid, public.listing_status, text) to authenticated;
