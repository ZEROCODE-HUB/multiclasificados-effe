-- =====================================================================
-- 0031_report_filters.sql — Filtros de fecha (server-side) para Reportes.
-- Recrea los RPCs de analítica con rango de fechas opcional (p_from/p_to)
-- aplicado sobre created_at. Sin fechas = todo el histórico. Idempotente.
-- =====================================================================

drop function if exists public.admin_category_revenue();
create or replace function public.admin_category_revenue(p_from date default null, p_to date default null)
returns table (cat text, avisos bigint, monto numeric)
language sql security definer set search_path = public as $$
  select coalesce(c.name, l.category_id) as cat,
         count(distinct l.id) as avisos,
         coalesce(sum(lr.revenue), 0)::numeric as monto
  from public.listings l
  left join public.categories c on c.id = l.category_id
  left join public.listing_revenue lr on lr.listing_id = l.id
  where public.is_staff(auth.uid())
    and (p_from is null or l.created_at >= p_from)
    and (p_to   is null or l.created_at < (p_to + 1))
  group by coalesce(c.name, l.category_id)
  order by avisos desc;
$$;

drop function if exists public.admin_region_distribution();
create or replace function public.admin_region_distribution(p_from date default null, p_to date default null)
returns table (reg text, avisos bigint, monto numeric)
language sql security definer set search_path = public as $$
  select coalesce(nullif(initcap(trim(split_part(l.location, ',', 1))), ''), 'Sin ubicación') as reg,
         count(distinct l.id) as avisos,
         coalesce(sum(lr.revenue), 0)::numeric as monto
  from public.listings l
  left join public.listing_revenue lr on lr.listing_id = l.id
  where public.is_staff(auth.uid())
    and (p_from is null or l.created_at >= p_from)
    and (p_to   is null or l.created_at < (p_to + 1))
  group by 1
  order by avisos desc
  limit 8;
$$;

drop function if exists public.admin_claims_summary();
create or replace function public.admin_claims_summary(p_from date default null, p_to date default null)
returns jsonb
language sql security definer set search_path = public as $$
  select case when not public.is_staff(auth.uid()) then '{}'::jsonb else
    jsonb_build_object(
      'recibidos',    (select count(*) from public.reports r
                         where (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < (p_to + 1))),
      'pendientes',   (select count(*) from public.reports r where r.status in ('open','reviewing')
                         and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < (p_to + 1))),
      'solucionados', (select count(*) from public.reports r where r.status = 'resolved'
                         and (p_from is null or r.created_at >= p_from) and (p_to is null or r.created_at < (p_to + 1))),
      'trend', coalesce((
        select jsonb_agg(jsonb_build_object('mes', mes, 'recibidos', rec, 'solucionados', sol) order by m)
        from (
          select date_trunc('month', now()) - (interval '1 month' * g) as m,
                 to_char(date_trunc('month', now()) - (interval '1 month' * g), 'Mon') as mes,
                 (select count(*) from public.reports r
                    where date_trunc('month', r.created_at) = date_trunc('month', now()) - (interval '1 month' * g)) as rec,
                 (select count(*) from public.reports r where r.status = 'resolved'
                    and date_trunc('month', coalesce(r.resolved_at, r.created_at)) = date_trunc('month', now()) - (interval '1 month' * g)) as sol
          from generate_series(5, 0, -1) g
        ) t
      ), '[]'::jsonb)
    )
  end;
$$;

grant execute on function public.admin_category_revenue(date, date)    to authenticated;
grant execute on function public.admin_region_distribution(date, date) to authenticated;
grant execute on function public.admin_claims_summary(date, date)      to authenticated;
