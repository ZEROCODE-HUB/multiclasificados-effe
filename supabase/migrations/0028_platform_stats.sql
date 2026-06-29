-- =====================================================================
-- 0028_platform_stats.sql — Métricas públicas para el landing (hero).
-- Conteos exactos: avisos activos, usuarios registrados y satisfacción
-- (promedio de reseñas). Accesible sin sesión (anon). Idempotente.
-- =====================================================================

create or replace function public.platform_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'active_listings', (select count(*) from public.listings where status = 'active'),
    'total_users',     (select count(*) from public.profiles),
    'reviews',         (select count(*) from public.reviews),
    'satisfaction',    (select case when count(*) = 0 then null
                                    else round(avg(rating) / 5.0 * 100) end
                        from public.reviews)
  );
$$;

grant execute on function public.platform_stats() to anon, authenticated;
