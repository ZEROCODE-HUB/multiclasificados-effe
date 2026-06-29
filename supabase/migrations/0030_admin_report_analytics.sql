-- =====================================================================
-- 0030_admin_report_analytics.sql — Datos reales para la pantalla Reportes.
-- Conteos e ingresos por categoría y por región (ciudad del texto de
-- ubicación), y resumen de reclamos/denuncias. Solo staff. Idempotente.
--
-- El ingreso por aviso = total de la orden pagada repartido en partes
-- iguales entre los avisos de esa orden (evita el doble conteo de paquetes).
-- =====================================================================

-- Ingreso real por aviso (orden pagada / nº de avisos de esa orden).
create or replace view public.listing_revenue as
  select ol.listing_id, (o.total / nullif(cnt.n, 0)) as revenue
  from public.orders o
  join public.order_listings ol on ol.order_id = o.id
  join (select order_id, count(*) n from public.order_listings group by order_id) cnt
    on cnt.order_id = o.id
  where o.status = 'paid';

-- Avisos + monto por categoría.
create or replace function public.admin_category_revenue()
returns table (cat text, avisos bigint, monto numeric)
language sql security definer set search_path = public as $$
  select coalesce(c.name, l.category_id) as cat,
         count(distinct l.id) as avisos,
         coalesce(sum(lr.revenue), 0)::numeric as monto
  from public.listings l
  left join public.categories c on c.id = l.category_id
  left join public.listing_revenue lr on lr.listing_id = l.id
  where public.is_staff(auth.uid())
  group by coalesce(c.name, l.category_id)
  order by avisos desc;
$$;

-- Avisos + monto por región (ciudad = primer segmento del texto de ubicación).
create or replace function public.admin_region_distribution()
returns table (reg text, avisos bigint, monto numeric)
language sql security definer set search_path = public as $$
  select coalesce(nullif(initcap(trim(split_part(l.location, ',', 1))), ''), 'Sin ubicación') as reg,
         count(distinct l.id) as avisos,
         coalesce(sum(lr.revenue), 0)::numeric as monto
  from public.listings l
  left join public.listing_revenue lr on lr.listing_id = l.id
  where public.is_staff(auth.uid())
  group by 1
  order by avisos desc
  limit 8;
$$;

-- Resumen de reclamos/denuncias + tendencia últimos 6 meses.
create or replace function public.admin_claims_summary()
returns jsonb
language sql security definer set search_path = public as $$
  select case when not public.is_staff(auth.uid()) then '{}'::jsonb else
    jsonb_build_object(
      'recibidos',    (select count(*) from public.reports),
      'pendientes',   (select count(*) from public.reports where status in ('open','reviewing')),
      'solucionados', (select count(*) from public.reports where status = 'resolved'),
      'trend', coalesce((
        select jsonb_agg(jsonb_build_object('mes', mes, 'recibidos', rec, 'solucionados', sol) order by m)
        from (
          select date_trunc('month', now()) - (interval '1 month' * g) as m,
                 to_char(date_trunc('month', now()) - (interval '1 month' * g), 'Mon') as mes,
                 (select count(*) from public.reports r
                    where date_trunc('month', r.created_at) = date_trunc('month', now()) - (interval '1 month' * g)) as rec,
                 (select count(*) from public.reports r
                    where r.status = 'resolved'
                      and date_trunc('month', coalesce(r.resolved_at, r.created_at)) = date_trunc('month', now()) - (interval '1 month' * g)) as sol
          from generate_series(5, 0, -1) g
        ) t
      ), '[]'::jsonb)
    )
  end;
$$;

grant execute on function public.admin_category_revenue()    to authenticated;
grant execute on function public.admin_region_distribution() to authenticated;
grant execute on function public.admin_claims_summary()      to authenticated;
