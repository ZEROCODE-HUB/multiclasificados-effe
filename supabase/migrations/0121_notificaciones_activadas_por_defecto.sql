-- =====================================================================
-- 0121_notificaciones_activadas_por_defecto.sql
--
-- Los tres canales de notificación (in-app, push, correo) pasan a estar
-- ACTIVADOS de fábrica.
--
-- Hasta ahora solo lo estaba el in-app: push y correo nacían apagados, así que
-- un anunciante que nunca entró a Configuración no recibía ni el aviso de que
-- su publicación está por vencer ni que alguien le escribió. Se enteraba solo
-- si abría la plataforma. Es una decisión de producto del cliente: quien no
-- quiera un canal lo apaga, pero nadie se pierde un mensaje por una preferencia
-- que jamás tocó.
--
-- Dos cambios, y hacen falta los dos:
--   1. El DEFAULT de las columnas, para las filas que se creen a partir de hoy.
--   2. El `coalesce` de `notify_user`, que es lo que decide de verdad: la
--      inmensa mayoría de usuarios NO tiene fila en esta tabla (solo se crea al
--      guardar preferencias), y para ellos manda el coalesce, no el default.
--
-- Lo que NO se toca a propósito: las filas que ya existen. Si alguien entró a
-- Configuración y apagó el correo, eso es una decisión suya y volver a
-- encendérsela por una migración sería pasarle por encima.
--
-- Idempotente: alter column set default y create or replace function.
-- =====================================================================

alter table public.notification_preferences alter column push  set default true;
alter table public.notification_preferences alter column email set default true;

create or replace function public.notify_user(p_user uuid, p_event text, p_title text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in_app boolean;
  v_push   boolean;
  v_email  boolean;
  v_hay    boolean;
begin
  if p_user is null then return; end if;

  select in_app, push, email, true into v_in_app, v_push, v_email, v_hay
  from public.notification_preferences
  where user_id = p_user and event_type = p_event;

  -- Sin fila = el usuario nunca eligió: los tres canales van activados.
  if not coalesce(v_hay, false) then
    v_in_app := true; v_push := true; v_email := true;
  end if;

  if coalesce(v_in_app, true) then
    insert into public.notifications (user_id, type, channel, title, payload)
    values (p_user, p_event, 'in_app', p_title, p_payload);
  end if;
  if coalesce(v_push, true) then
    insert into public.notifications (user_id, type, channel, title, payload)
    values (p_user, p_event, 'push', p_title, p_payload);
  end if;
  if coalesce(v_email, true) then
    insert into public.notifications (user_id, type, channel, title, payload)
    values (p_user, p_event, 'email', p_title, p_payload);
  end if;
end;
$$;

-- `create or replace` conserva los permisos que ya tenía, pero se repite el
-- cierre de la 0103 para que quede a la vista: a `notify_user` la llaman los
-- disparadores del servidor, que corren como dueño. Desde el navegador, nadie:
-- con EXECUTE, cualquiera podría escribir en la campana de cualquier usuario.
revoke execute on function public.notify_user(uuid, text, text, jsonb)
  from public, anon, authenticated;
