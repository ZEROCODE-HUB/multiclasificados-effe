-- =====================================================================
-- 0026_push_trigger.sql — Dispara la Edge Function send-push (FCM)
-- cuando se inserta una notificación in-app. Usa pg_net para el HTTP POST.
-- Idempotente.
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.on_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  if new.channel = 'in_app' then
    perform net.http_post(
      url     := 'https://prhbgniwymaaevnisyov.supabase.co/functions/v1/send-push',
      body    := jsonb_build_object('record', to_jsonb(new)),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.on_notification_push();
