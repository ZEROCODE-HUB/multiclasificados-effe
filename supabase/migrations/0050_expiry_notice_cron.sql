-- =====================================================================
-- 0050_expiry_notice_cron.sql — Programa el aviso de vencimiento (0049)
-- Archivo separado del que define la función: si pg_cron no está, el resto
-- del esquema ya quedó aplicado (mismo patrón que 0016/0017). Idempotente.
-- =====================================================================

create extension if not exists pg_cron;

-- Cada 15 min: como avisa cuando falta ≤1 h, el dueño recibe la alerta entre
-- 45 y 60 min antes de que su aviso caduque.
do $$ begin
  perform cron.unschedule('notify-expiring-listings');
exception when others then null;
end $$;
select cron.schedule('notify-expiring-listings', '*/15 * * * *', $$ select public.notify_expiring_listings(); $$);
