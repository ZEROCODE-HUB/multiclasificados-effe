-- =====================================================================
-- 0024_notifications_replica_identity.sql — REQ-09
-- Realtime fiable para la campanita de notificaciones en producción.
-- Igual que con messages/conversations (0022): con REPLICA IDENTITY FULL
-- los eventos UPDATE (marcar como leída) pasan la RLS de Realtime y se
-- entregan al usuario. Idempotente.
-- =====================================================================

alter table public.notifications replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;
