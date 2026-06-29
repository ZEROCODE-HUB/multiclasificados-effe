-- =====================================================================
-- 0022_realtime_replica_identity.sql — REQ-05
-- Realtime fiable en producción para la mensajería.
--
-- Con la replica identity por defecto (solo PK), los eventos UPDATE de
-- Realtime no incluyen la fila completa, lo que provoca que la evaluación
-- de RLS sobre el cambio falle y NO se entreguen los cambios de estado
-- (delivered/read). Con REPLICA IDENTITY FULL la fila completa viaja en el
-- WAL y Realtime puede aplicar la RLS y entregar el evento al participante.
-- Idempotente.
-- =====================================================================

alter table public.messages       replica identity full;
alter table public.conversations  replica identity full;

-- Asegura que ambas tablas estén en la publicación de Realtime
-- (no falla si ya estaban añadidas).
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
end $$;
