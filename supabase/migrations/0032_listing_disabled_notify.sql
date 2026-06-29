-- =====================================================================
-- 0032_listing_disabled_notify.sql — Notificar al dueño al deshabilitar/habilitar
-- Cuando el staff cambia el estado de un aviso, el dueño recibe una
-- notificación in-app (campanita) con el motivo escrito por el admin.
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
  if not public.is_staff(auth.uid()) then
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
