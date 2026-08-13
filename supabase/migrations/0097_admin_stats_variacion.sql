-- =====================================================================
-- 0097_admin_stats_variacion.sql
--
-- Las tarjetas del panel de control enseñaban porcentajes ESCRITOS A MANO
-- ("+3.2%", "+8.4%", "+14.1%" en AdminDashboard.tsx): constantes que no se
-- movían aunque se publicaran cientos de avisos. QA lo detectó.
--
-- Para poder calcularlos de verdad, admin_stats() devuelve ahora, junto a cada
-- cifra, la que esa misma cifra tenía hace 30 días. No hace falta guardar
-- históricos: las tablas ya tienen las fechas necesarias.
--
-- Y de paso se corrige `revenue`, que sumaba TODA orden 'paid' — créditos
-- regalados por un admin, backfill y pruebas 'SIMULADO' incluidos. Es el mismo
-- error que la 0094 corrigió en el gráfico, así que la misma pantalla mostraba
-- dos cifras distintas del mismo concepto (S/ 5.373,74 contra S/ 145,77). Aquí
-- se aplica el filtro idéntico al de admin_growth_series.
--
-- Misma firma y mismo tipo de retorno (jsonb, solo se añaden claves), así que
-- nada de lo que ya consume la RPC se rompe. Idempotente.
-- =====================================================================

create or replace function public.admin_stats()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with t as (
    -- Ventana móvil: se recalcula sola cada día.
    select (now() - interval '30 days') as t0
  )
  select case when public.is_staff(auth.uid()) then jsonb_build_object(

    'window_days', 30,

    -- ── Usuarios ── exacto: profiles guarda created_at.
    'users',      (select count(*) from public.profiles),
    'users_prev', (select count(*) from public.profiles p, t where p.created_at <= t.t0),

    -- ── Avisos ──
    'active_listings',  (select count(*) from public.listings where status = 'active'),
    -- Aproximación honesta: cuántos estaban VIGENTES hace 30 días, según sus
    -- propias fechas. No puede ver los que se borraron desde entonces (ya no
    -- están en la tabla), pero no inventa nada.
    'active_listings_prev', (
      select count(*) from public.listings l, t
       where l.published_at <= t.t0
         and (l.expires_at is null or l.expires_at > t.t0)
    ),

    'pending_listings', (select count(*) from public.listings where status = 'pending'),

    'sold_listings', (select count(*) from public.listings where status = 'sold'),
    -- Aquí la aproximación es más gruesa: no existe `sold_at`, así que se usa
    -- la última modificación. Un aviso vendido y editado después contaría como
    -- vendido más tarde de lo que fue. Es lo mejor que permite el esquema.
    'sold_listings_prev', (
      select count(*) from public.listings l, t
       where l.status = 'sold' and l.updated_at <= t.t0
    ),

    'total_listings', (select count(*) from public.listings),

    -- ── Reportes abiertos ── exacto: reports guarda resolved_at, así que se
    -- sabe cuáles seguían abiertos en aquel momento.
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'reports_open_prev', (
      select count(*) from public.reports r, t
       where r.created_at <= t.t0
         and (r.resolved_at is null or r.resolved_at > t.t0)
    ),

    -- ── Ingresos ── SOLO lo cobrado de verdad por la pasarela. Mismo filtro
    -- que admin_growth_series (0094), para que la tarjeta y el gráfico digan lo
    -- mismo.
    'revenue', coalesce((
      select sum(o.total) from public.orders o
       where o.status = 'paid'
         and o.payment_provider = 'izipay'
         and o.payment_ref is not null
         and o.payment_ref <> 'SIMULADO'
    ), 0),
    'revenue_prev', coalesce((
      select sum(o.total) from public.orders o, t
       where o.status = 'paid'
         and o.payment_provider = 'izipay'
         and o.payment_ref is not null
         and o.payment_ref <> 'SIMULADO'
         and coalesce(o.paid_at, o.created_at) <= t.t0
    ), 0)

  ) else '{}'::jsonb end;
$$;

revoke execute on function public.admin_stats() from public;
revoke execute on function public.admin_stats() from anon;
grant  execute on function public.admin_stats() to authenticated, service_role;

comment on function public.admin_stats() is
  'Cifras del panel de control + el valor que cada una tenía hace 30 días (para la variación). Ingresos = solo cobros reales por la pasarela.';
