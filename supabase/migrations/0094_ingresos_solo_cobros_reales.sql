-- =====================================================================
-- 0094_ingresos_solo_cobros_reales.sql
--
-- El reporte de "Pagos" (admin_growth_series) llamaba "Ingresos (S/)" a la
-- suma de TODAS las órdenes con status='paid'. Ahí dentro caían cosas que
-- nunca movieron dinero:
--   • saldo otorgado a mano por un admin  (payment_provider = 'creditos')
--   • datos migrados                       (payment_provider = 'backfill')
--   • pruebas de la pasarela               (payment_ref = 'SIMULADO')
--   • órdenes antiguas sin proveedor       (payment_provider is null)
-- Medido el 2026-08-13 en producción: el gráfico mostraba S/ 5.355,72
-- cuando por la pasarela habían entrado S/ 145,77. Un panel que exagera lo
-- facturado 36 veces no es un panel, es una trampa.
--
-- Ahora `ingresos` cuenta SOLO el dinero cobrado de verdad: órdenes pagadas
-- por la pasarela y con referencia real de la transacción.
--
-- Y se agrupa por `paid_at` (cuándo entró el dinero) en vez de `created_at`
-- (cuándo se armó el carrito), que es lo que corresponde a un reporte de
-- ingresos: una orden creada el 31 y pagada el 1 pertenece al mes en que se
-- cobró. Se usa coalesce(paid_at, created_at) por si alguna fila antigua no
-- tiene paid_at.
--
-- El resto de series (usuarios, avisos, postulaciones) no cambia.
-- Idempotente: CREATE OR REPLACE con la misma firma y el mismo tipo de retorno.
-- =====================================================================

create or replace function public.admin_growth_series(p_range text default '6m')
returns table(mes text, ingresos numeric, usuarios bigint, avisos bigint, postulaciones bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz       constant text   := 'America/Lima';
  v_meses    constant text[] := array['Ene','Feb','Mar','Abr','May','Jun',
                                      'Jul','Ago','Set','Oct','Nov','Dic'];
  v_range    text := coalesce(p_range, '6m');
  v_diario   boolean;
  v_bucket   text;
  v_paso     interval;
  v_con_anio boolean;
  v_ahora    timestamp;
  v_desde    timestamp;
begin
  if not public.is_staff(auth.uid()) then
    return;
  end if;

  if v_range not in ('7d', '30d', '6m', '12m', 'all') then
    v_range := '6m';
  end if;

  v_diario   := v_range in ('7d', '30d');
  v_bucket   := case when v_diario then 'day' else 'month' end;
  v_paso     := case when v_diario then interval '1 day' else interval '1 month' end;
  v_con_anio := v_range in ('12m', 'all');

  v_ahora := date_trunc(v_bucket, (now() at time zone v_tz));

  if v_range = '7d' then
    v_desde := v_ahora - interval '6 days';
  elsif v_range = '30d' then
    v_desde := v_ahora - interval '29 days';
  elsif v_range = '6m' then
    v_desde := v_ahora - interval '5 months';
  elsif v_range = '12m' then
    v_desde := v_ahora - interval '11 months';
  else
    select date_trunc('month', (least(
             coalesce((select min(o.created_at) from public.orders   o), now()),
             coalesce((select min(p.created_at) from public.profiles p), now())
           ) at time zone v_tz))
      into v_desde;
    v_desde := greatest(v_desde, v_ahora - interval '5 years');
  end if;

  return query
  with buckets as (
    select generate_series(v_desde, v_ahora, v_paso) as m
  )
  select
    case
      when v_diario then to_char(b.m, 'DD/MM')
      else v_meses[extract(month from b.m)::int]
           || case when v_con_anio then ' ' || to_char(b.m, 'YY') else '' end
    end as mes,
    coalesce((
      select sum(o.total) from public.orders o
      where o.status = 'paid'
        -- Solo cobros reales de la pasarela: con proveedor, con referencia de
        -- la transacción y sin la marca de las pruebas simuladas.
        and o.payment_provider = 'izipay'
        and o.payment_ref is not null
        and o.payment_ref <> 'SIMULADO'
        and date_trunc(v_bucket, (coalesce(o.paid_at, o.created_at) at time zone v_tz)) = b.m
    ), 0)::numeric as ingresos,
    (
      select count(*) from public.profiles p
      where date_trunc(v_bucket, (p.created_at at time zone v_tz)) = b.m
    )::bigint as usuarios,
    (
      select count(*) from public.listings l
      where date_trunc(v_bucket, (l.created_at at time zone v_tz)) = b.m
    )::bigint as avisos,
    (
      select count(*) from public.job_applications a
      where date_trunc(v_bucket, (a.created_at at time zone v_tz)) = b.m
    )::bigint as postulaciones
  from buckets b
  order by b.m;
end;
$$;

grant execute on function public.admin_growth_series(text) to authenticated;
