-- =====================================================================
-- 0130_admin_configura_notificaciones.sql — la otra mitad del punto B-02
--
-- La primera mitad ya está: desde la 0121 los tres canales nacen activados.
-- Falta lo que el cliente pidió a continuación, y con un motivo muy concreto:
--
--   "Si en algún momento el cliente desactiva alguna notificación, ante la NO
--    llegada a sus bandejas de avisos, mensajes y correos, nosotros debemos
--    poder activarlos."
--
-- Es el caso real de soporte: alguien llama diciendo que no le llegan los
-- avisos, y resulta que él mismo apagó el canal hace meses. Hoy administración
-- solo puede decirle por teléfono dónde tiene que pulsar.
--
-- POR QUÉ UNA RPC Y NO ABRIR LA RLS
--
-- La política de `notification_preferences` es `user_id = auth.uid()`: cada uno
-- y solo cada uno. Abrirla al personal daría acceso de escritura libre a la
-- tabla; con una función `security definer` el acceso pasa por una puerta que
-- comprueba el permiso, valida el evento y DEJA CONSTANCIA de quién lo cambió.
--
-- Eso último no es burocracia: se está tocando la configuración de otra persona
-- sin que ella lo pida. Si mañana alguien pregunta por qué volvió a recibir
-- correos, tiene que poder responderse.
--
-- Idempotente.
-- =====================================================================

-- ---------- Leer las preferencias de un usuario ----------
create or replace function public.admin_notification_prefs(p_user uuid)
returns table (event_type text, in_app boolean, push boolean, email boolean)
language sql
stable
security definer
set search_path = public
as $$
  select n.event_type, n.in_app, n.push, n.email
    from public.notification_preferences n
   where public.has_perm('Gestión de usuarios', 'view')
     and n.user_id = p_user;
$$;

revoke execute on function public.admin_notification_prefs(uuid) from public;
grant  execute on function public.admin_notification_prefs(uuid) to authenticated;

comment on function public.admin_notification_prefs(uuid) is
  'Preferencias de notificación de un usuario, para el panel. Devuelve solo las '
  'filas EXPLÍCITAS: las que no están valen los tres canales activados, igual '
  'que en notify_user (migración 0121).';

-- ---------- Cambiarlas ----------
create or replace function public.admin_set_notification_pref(
  p_user   uuid,
  p_event  text,
  p_in_app boolean,
  p_push   boolean,
  p_email  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes record;
begin
  if not public.has_perm('Gestión de usuarios', 'edit') then
    raise exception 'no autorizado';
  end if;
  if p_event is null or btrim(p_event) = '' then
    raise exception 'Falta el evento';
  end if;

  -- Se guarda cómo estaba: la auditoría de "se activó el correo" sin el valor
  -- anterior no permite saber si se cambió algo o se reescribió lo mismo.
  select in_app, push, email into v_antes
    from public.notification_preferences
   where user_id = p_user and event_type = p_event;

  insert into public.notification_preferences (user_id, event_type, in_app, push, email)
  values (p_user, p_event, coalesce(p_in_app, true), coalesce(p_push, true), coalesce(p_email, true))
  on conflict (user_id, event_type) do update
    set in_app = excluded.in_app,
        push   = excluded.push,
        email  = excluded.email;

  perform public.log_audit(
    'set_notification_pref', 'user', p_user::text,
    jsonb_build_object(
      'evento', p_event,
      'antes',  case when v_antes is null then null
                     else jsonb_build_object('in_app', v_antes.in_app, 'push', v_antes.push, 'email', v_antes.email) end,
      'ahora',  jsonb_build_object('in_app', p_in_app, 'push', p_push, 'email', p_email)
    )
  );
end;
$$;

revoke execute on function public.admin_set_notification_pref(uuid, text, boolean, boolean, boolean) from public;
grant  execute on function public.admin_set_notification_pref(uuid, text, boolean, boolean, boolean) to authenticated;

comment on function public.admin_set_notification_pref(uuid, text, boolean, boolean, boolean) is
  'B-02: administración activa o desactiva un canal de notificación de un '
  'usuario. Va por RPC y no abriendo la RLS para que quede constancia de quién '
  'tocó la configuración de otra persona, con el valor anterior.';
