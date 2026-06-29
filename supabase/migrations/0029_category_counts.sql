-- =====================================================================
-- 0029_category_counts.sql — Conteo real de avisos activos por categoría
-- para el grid "Explora por categoría" del landing. Público (anon).
-- Idempotente.
-- =====================================================================

create or replace function public.category_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(category_id, cnt), '{}'::jsonb)
  from (
    select category_id, count(*) as cnt
    from public.listings
    where status = 'active'
    group by category_id
  ) t;
$$;

grant execute on function public.category_counts() to anon, authenticated;
