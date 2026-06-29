-- =====================================================================
-- 0029_admin_listing_status_reason.sql — Deshabilitar/habilitar avisos (REQ-ADM-02)
-- Extiende admin_set_listing_status para guardar el motivo (rejection_reason)
-- cuando se deshabilita un aviso. Reemplaza la versión de 2 argumentos.
-- =====================================================================

drop function if exists public.admin_set_listing_status(uuid, public.listing_status);

create or replace function public.admin_set_listing_status(
  p_listing uuid,
  p_status  public.listing_status,
  p_reason  text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  update public.listings
  set status = p_status,
      -- Guarda el motivo al rechazar/deshabilitar; lo limpia al reactivar.
      rejection_reason = case
        when p_status = 'rejected' then coalesce(p_reason, rejection_reason)
        when p_status = 'active'   then null
        else rejection_reason
      end
  where id = p_listing;

  perform public.log_audit('set_listing_status', 'listing', p_listing::text,
                           jsonb_build_object('status', p_status, 'reason', p_reason));
end;
$$;

grant execute on function public.admin_set_listing_status(uuid, public.listing_status, text) to authenticated;
