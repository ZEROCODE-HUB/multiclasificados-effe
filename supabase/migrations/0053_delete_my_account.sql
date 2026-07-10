-- =====================================================================
-- 0053_delete_my_account.sql — el usuario puede borrar su propia cuenta.
--
-- Requisito de tienda (App móvil): dentro de la app debe existir la opción de
-- eliminar la cuenta. Borrar un usuario de `auth.users` exige privilegios que el
-- cliente no tiene, así que se expone una función SECURITY DEFINER que solo
-- puede borrar AL USUARIO QUE LA LLAMA (auth.uid()), nunca a otro.
--
-- El borrado es en cascada por las claves foráneas ya existentes:
--   profiles.id            -> auth.users(id)  ON DELETE CASCADE
--   <tablas del usuario>.* -> profiles(id)    ON DELETE CASCADE
-- Los registros legales/auditoría (reclamaciones, logs) referencian con
-- ON DELETE SET NULL, así que se conservan anonimizados (obligación legal).
--
-- Idempotente.
-- =====================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No hay una sesión activa';
  end if;
  -- Solo puede borrarse a sí mismo. La cascada limpia perfil, avisos,
  -- favoritos, mensajes, créditos, etc.
  delete from auth.users where id = uid;
end;
$$;

-- Que NADIE sin sesión pueda invocarla; solo usuarios autenticados (y cada uno
-- solo puede borrarse a sí mismo, porque la función usa auth.uid()).
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
