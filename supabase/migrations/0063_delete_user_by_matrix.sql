-- =====================================================================
-- 0063_delete_user_by_matrix.sql
-- "Eliminar usuario" pasa de ser superadmin-only a respetar la matriz de
-- permisos (Gestión de usuarios · delete), para que el toggle de la pantalla
-- "Roles y permisos" tenga efecto real. `has_perm` ya devuelve true para el
-- superadmin, así que un único chequeo cubre superadmin + admins con delete.
-- Idempotente (create or replace). Reemplaza el guard de 0024_admin_delete_user.
-- =====================================================================

create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('Gestión de usuarios', 'delete') then
    raise exception 'no tienes permiso para eliminar usuarios';
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
