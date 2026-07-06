-- =====================================================================
-- 0039_admin_communications.sql — Centro de mensajes del panel (real)
-- Pantalla /dashboard/{admin,superadmin}/comunicaciones.
--
-- Reemplaza el envío simulado por envíos REALES:
--   • Individual  → notificación in-app + push (FCM) a un usuario concreto.
--   • Masivo      → in-app + push a una audiencia real (todos / anunciantes /
--                   buscadores), con conteo real de destinatarios.
--   • Email       → opcional; inserta filas channel='email' que consume la
--                   Edge Function send-email (ver EMAIL-SETUP.md).
--
-- Todo staff-only (is_staff) y con registro de auditoría. Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Audiencia real por segmento. 'all' = todos los perfiles; 'anunciante' /
-- 'buscador' = usuarios con ese rol (tabla user_roles). Devuelve ids únicos.
-- ---------------------------------------------------------------------
create or replace function public.comm_audience(p_audience text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p_audience = 'all'
     or exists (
       select 1 from public.user_roles ur
       where ur.user_id = p.id
         and ur.role::text = p_audience
     );
$$;

-- Conteo real de destinatarios para una audiencia (para la UI).
create or replace function public.admin_audience_count(p_audience text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  select count(*) into v_count from public.comm_audience(coalesce(p_audience, 'all'));
  return coalesce(v_count, 0);
end;
$$;

-- ---------------------------------------------------------------------
-- Envío INDIVIDUAL. p_target puede ser un uuid o un email / nombre.
-- Crea la notificación in-app (dispara push) y, si p_email, la fila email.
-- Devuelve { sent, recipient } — sent=0 si no se encontró al destinatario.
-- ---------------------------------------------------------------------
create or replace function public.admin_send_message(
  p_target text,
  p_title  text,
  p_body   text,
  p_email  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_email  text;
  v_name   text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'asunto y mensaje son obligatorios';
  end if;

  -- Resolver destinatario: uuid directo, o email exacto, o nombre aproximado.
  if p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id, email, full_name into v_user, v_email, v_name
    from public.profiles where id = p_target::uuid;
  else
    select id, email, full_name into v_user, v_email, v_name
    from public.profiles
    where lower(email) = lower(btrim(p_target))
       or full_name ilike '%' || btrim(p_target) || '%'
    order by (lower(email) = lower(btrim(p_target))) desc
    limit 1;
  end if;

  if v_user is null then
    return jsonb_build_object('sent', 0, 'recipient', null);
  end if;

  -- In-app (dispara push vía trigger notifications_push).
  insert into public.notifications (user_id, type, channel, title, payload)
  values (v_user, 'admin_message', 'in_app', p_title, jsonb_build_object('body', p_body));

  -- Email (dispara send-email vía trigger notifications_email), opcional.
  if p_email then
    insert into public.notifications (user_id, type, channel, title, payload)
    values (v_user, 'admin_message', 'email', p_title, jsonb_build_object('body', p_body));
  end if;

  perform public.log_audit('send_message', 'user', v_user::text,
    jsonb_build_object('title', p_title, 'email', p_email));

  return jsonb_build_object('sent', 1, 'recipient', coalesce(v_name, v_email));
end;
$$;

-- ---------------------------------------------------------------------
-- Envío MASIVO a una audiencia real. Devuelve el nº de destinatarios.
-- p_copy_staff añade al equipo interno (admin/superadmin/moderador/soporte).
-- ---------------------------------------------------------------------
create or replace function public.admin_broadcast(
  p_audience   text,
  p_title      text,
  p_body       text,
  p_email      boolean default false,
  p_copy_staff boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'asunto y mensaje son obligatorios';
  end if;

  -- Conjunto de destinatarios: audiencia + (opcional) equipo interno, únicos.
  -- comm_audience() devuelve `setof uuid`; la nombramos con alias de columna (v).
  create temporary table _recipients on commit drop as
    select ca.v as id from public.comm_audience(coalesce(p_audience, 'all')) as ca(v)
    union
    select p.id from public.profiles p
    where p_copy_staff and exists (
      select 1 from public.user_roles ur
      where ur.user_id = p.id
        and ur.role::text in ('admin', 'superadmin', 'moderador', 'soporte')
    );

  select count(*) into v_count from _recipients;

  -- In-app (dispara push por fila).
  insert into public.notifications (user_id, type, channel, title, payload)
  select r.id, 'admin_message', 'in_app', p_title, jsonb_build_object('body', p_body)
  from _recipients r;

  -- Email (dispara send-email por fila), opcional.
  if p_email then
    insert into public.notifications (user_id, type, channel, title, payload)
    select r.id, 'admin_message', 'email', p_title, jsonb_build_object('body', p_body)
    from _recipients r;
  end if;

  perform public.log_audit('broadcast', 'audience', p_audience,
    jsonb_build_object('title', p_title, 'recipients', v_count,
                       'email', p_email, 'copy_staff', p_copy_staff));

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Trigger de EMAIL: dispara la Edge Function send-email cuando se inserta
-- una notificación channel='email'. Espeja notifications_push (pg_net).
-- ---------------------------------------------------------------------
create or replace function public.on_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  if new.channel = 'email' then
    perform net.http_post(
      url     := 'https://prhbgniwymaaevnisyov.supabase.co/functions/v1/send-email',
      body    := jsonb_build_object('record', to_jsonb(new)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_email on public.notifications;
create trigger notifications_email
  after insert on public.notifications
  for each row execute function public.on_notification_email();

-- ---------------------------------------------------------------------
-- Estadísticas REALES para la tarjeta "Resumen de envíos".
-- Cuenta las notificaciones in-app de tipo admin_message (una por
-- destinatario) y lista los últimos envíos desde el registro de auditoría.
-- ---------------------------------------------------------------------
create or replace function public.admin_comm_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_today integer; v_total integer; v_recent jsonb;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;

  select count(*) filter (where created_at >= date_trunc('day', now())),
         count(*)
    into v_today, v_total
  from public.notifications
  where type = 'admin_message' and channel = 'in_app';

  select coalesce(jsonb_agg(r order by r_created desc), '[]'::jsonb)
    into v_recent
  from (
    select jsonb_build_object(
             'action',     a.action,
             'title',      a.metadata->>'title',
             'recipients', coalesce((a.metadata->>'recipients')::int, 1),
             'created_at', a.created_at
           ) as r,
           a.created_at as r_created
    from public.audit_logs a
    where a.action in ('send_message', 'broadcast')
    order by a.created_at desc
    limit 6
  ) s;

  return jsonb_build_object('today', coalesce(v_today, 0),
                            'total', coalesce(v_total, 0),
                            'recent', v_recent);
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
-- comm_audience es un helper interno de las RPCs; no debe ser invocable
-- directamente desde el cliente (evita enumerar ids de usuarios).
revoke execute on function public.comm_audience(text) from public, anon, authenticated;

grant execute on function public.admin_audience_count(text)                        to authenticated;
grant execute on function public.admin_send_message(text, text, text, boolean)     to authenticated;
grant execute on function public.admin_broadcast(text, text, text, boolean, boolean) to authenticated;
grant execute on function public.admin_comm_stats()                                to authenticated;
