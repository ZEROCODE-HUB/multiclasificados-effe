-- =====================================================================
-- 0062_listing_revenue_from_credits.sql
-- Reatribuye el ingreso por aviso a partir del CRÉDITO GASTADO, no de las
-- órdenes de publicación (que ya no se crean: publicar solo descuenta saldo,
-- ver src/lib/publish.ts). El comprobante y el cobro real ocurren únicamente al
-- COMPRAR créditos; el consumo por aviso queda registrado en
-- credit_transactions (type='spend', listing_id). Idempotente.
--
-- En la plataforma 1 crédito = 1 sol, así que sum(abs(credits)) es el monto en
-- soles gastado en cada aviso. Sustituye a la definición basada en
-- orders/order_listings de 0030_admin_report_analytics.sql, manteniendo las
-- mismas columnas (listing_id, revenue) para no romper a
-- admin_category_revenue() ni admin_region_distribution().
-- =====================================================================

create or replace view public.listing_revenue as
  select ct.listing_id, sum(abs(ct.credits)) as revenue
  from public.credit_transactions ct
  where ct.type = 'spend'
    and ct.listing_id is not null
  group by ct.listing_id;
