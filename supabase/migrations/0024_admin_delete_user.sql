-- =====================================================================
-- 0024_admin_delete_user.sql — Eliminación de usuarios (REQ-ADM-03)
-- Borra al usuario de auth.users; las FK `on delete cascade` arrastran su
-- perfil, roles, avisos, mensajes, órdenes, etc. Solo superadmin.
-- =====================================================================

create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'superadmin') then
    raise exception 'solo el superadmin puede eliminar usuarios';
  end if;
  if p_user = auth.uid() then
    raise exception 'no puedes eliminar tu propia cuenta';
  end if;

  -- Auditoría antes del borrado (después se pierde la referencia al usuario).
  perform public.log_audit('delete_user', 'user', p_user::text, '{}'::jsonb);

  -- Libera la única referencia NO ACTION que bloquearía el borrado.
  update public.pricing_settings set updated_by = null where updated_by = p_user;

  -- Borra de auth.users; el resto cae por las FK on delete cascade.
  delete from auth.users where id = p_user;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;
