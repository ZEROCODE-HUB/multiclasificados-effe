-- =====================================================================
-- 0017_cron.sql — Programación periódica (REQ-04 alertas + REQ-01 expiración)
-- Archivo separado: si pg_cron no está disponible, el resto del esquema
-- ya quedó aplicado igualmente. (idempotente)
-- =====================================================================

create extension if not exists pg_cron;

-- Expira avisos vencidos cada 30 minutos.
do $$ begin
  perform cron.unschedule('expire-listings');
exception when others then null;
end $$;
select cron.schedule('expire-listings', '*/30 * * * *', $$ select public.expire_listings(); $$);

-- Corre las alertas de búsquedas guardadas cada 15 minutos.
do $$ begin
  perform cron.unschedule('saved-search-alerts');
exception when others then null;
end $$;
select cron.schedule('saved-search-alerts', '*/15 * * * *', $$ select public.run_saved_search_alerts(); $$);
