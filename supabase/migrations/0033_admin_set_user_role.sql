-- =====================================================================
-- 0033_admin_set_user_role.sql — Cambiar el rol de un usuario (RBAC)
-- Reemplaza TODOS los roles del usuario por el seleccionado (rol único en el
-- panel). Antes solo se "agregaba" un rol, por lo que un admin seguía siendo
-- admin al intentar pasarlo a buscador. Solo superadmin.
-- =====================================================================

create or replace function public.admin_set_user_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'superadmin') then
    raise exception 'solo el superadmin gestiona roles';
  end if;
  if p_user = auth.uid() then
    raise exception 'no puedes cambiar tu propio rol';
  end if;

  delete from public.user_roles where user_id = p_user;
  insert into public.user_roles (user_id, role) values (p_user, p_role)
    on conflict (user_id, role) do nothing;

  perform public.log_audit('set_user_role', 'user', p_user::text,
                           jsonb_build_object('role', p_role));
end;
$$;

grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
