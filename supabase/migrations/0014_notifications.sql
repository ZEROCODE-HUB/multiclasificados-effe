-- =====================================================================
-- 0014_notifications.sql — REQ-09: matriz de notificaciones (in-app/push/email)
-- + disparadores de eventos del sistema (idempotente)
-- =====================================================================

-- Canal y evento en cada notificación.
alter table public.notifications add column if not exists channel public.notification_channel not null default 'in_app';
alter table public.notifications add column if not exists title text;

-- Preferencias por usuario y tipo de evento (qué canales recibe).
create table if not exists public.notification_preferences (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_type text not null,
  in_app     boolean not null default true,
  push       boolean not null default false,
  email      boolean not null default false,
  primary key (user_id, event_type)
);

alter table public.notification_preferences enable row level security;
drop policy if exists "notif_prefs_own" on public.notification_preferences;
create policy "notif_prefs_own" on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Crea una notificación in-app respetando las preferencias del usuario.
-- (Los canales push/email los consume luego una Edge Function leyendo esta cola.)
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
begin
  if p_user is null then return; end if;

  select in_app, push, email into v_in_app, v_push, v_email
  from public.notification_preferences
  where user_id = p_user and event_type = p_event;

  -- Por defecto, in-app activado si no hay preferencia explícita.
  if coalesce(v_in_app, true) then
    insert into public.notifications (user_id, type, channel, title, payload)
    values (p_user, p_event, 'in_app', p_title, p_payload);
  end if;
  if coalesce(v_push, false) then
    insert into public.notifications (user_id, type, channel, title, payload)
    values (p_user, p_event, 'push', p_title, p_payload);
  end if;
  if coalesce(v_email, false) then
    insert into public.notifications (user_id, type, channel, title, payload)
    values (p_user, p_event, 'email', p_title, p_payload);
  end if;
end;
$$;

-- ---------- Disparadores de eventos ----------

-- Nuevo mensaje → notifica al otro participante (REQ-05/REQ-09).
create or replace function public.on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
begin
  select case when c.buyer_id = new.sender_id then c.seller_id else c.buyer_id end
  into v_recipient
  from public.conversations c where c.id = new.conversation_id;

  perform public.notify_user(
    v_recipient, 'new_message', 'Nuevo mensaje',
    jsonb_build_object('conversation_id', new.conversation_id, 'preview', left(new.body, 80))
  );
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.on_new_message();

-- Cambio de estado de postulación → notifica al postulante (REQ-06/REQ-09).
create or replace function public.on_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.notify_user(
      new.applicant_id, 'application_status', 'Tu postulación cambió de estado',
      jsonb_build_object('listing_id', new.listing_id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists applications_notify on public.job_applications;
create trigger applications_notify
  after update on public.job_applications
  for each row execute function public.on_application_status();

-- Nueva reseña → notifica al usuario reseñado (REQ-07/REQ-09).
create or replace function public.on_new_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_user(
    new.reviewee_id, 'new_review', 'Recibiste una nueva reseña',
    jsonb_build_object('listing_id', new.listing_id, 'rating', new.rating)
  );
  return new;
end;
$$;

drop trigger if exists reviews_notify on public.reviews;
create trigger reviews_notify
  after insert on public.reviews
  for each row execute function public.on_new_review();

-- Realtime para notificaciones in-app.
do $$ begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;
