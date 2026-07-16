-- =====================================================================
-- Serie de crecimiento con rango elegible (dashboard admin).
--
-- Antes la serie estaba fija en 6 meses. Ahora el rango llega por parámetro:
--   '7d'  → últimos 7 días   (agrupado por día)
--   '30d' → últimos 30 días  (agrupado por día)
--   '6m'  → últimos 6 meses  (agrupado por mes, por defecto)
--   '12m' → últimos 12 meses (agrupado por mes)
--   'all' → histórico completo desde el primer dato (agrupado por mes)
--
-- Los buckets se calculan en hora de Lima: con granularidad diaria, usar UTC
-- movería a las 19:00-23:59 locales al día siguiente.
-- =====================================================================

-- La versión anterior no tenía parámetros. Hay que eliminarla: si se queda,
-- la llamada sin argumentos coincide con ambas firmas y Postgres la rechaza
-- por ambigua ("function name is not unique").
drop function if exists public.admin_growth_series();

create or replace function public.admin_growth_series(p_range text default '6m')
returns table (mes text, ingresos numeric, usuarios bigint)
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
  -- El rol se valida adentro (la función es security definer).
  if not public.is_staff(auth.uid()) then
    return;
  end if;

  -- Un rango desconocido cae a 6m en lugar de devolver una serie vacía.
  if v_range not in ('7d', '30d', '6m', '12m', 'all') then
    v_range := '6m';
  end if;

  v_diario   := v_range in ('7d', '30d');
  v_bucket   := case when v_diario then 'day' else 'month' end;
  v_paso     := case when v_diario then interval '1 day' else interval '1 month' end;
  -- Con varios años a la vista, "Ene" solo es ambiguo; se le agrega el año.
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
    -- Histórico: desde el primer pedido o perfil que exista.
    select date_trunc('month', (least(
             coalesce((select min(o.created_at) from public.orders   o), now()),
             coalesce((select min(p.created_at) from public.profiles p), now())
           ) at time zone v_tz))
      into v_desde;
    -- Tope de seguridad: una fecha corrupta no debe generar miles de buckets.
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
        and date_trunc(v_bucket, (o.created_at at time zone v_tz)) = b.m
    ), 0)::numeric as ingresos,
    (
      select count(*) from public.profiles p
      where date_trunc(v_bucket, (p.created_at at time zone v_tz)) = b.m
    )::bigint as usuarios
  from buckets b
  order by b.m;
end;
$$;

grant execute on function public.admin_growth_series(text) to authenticated;
