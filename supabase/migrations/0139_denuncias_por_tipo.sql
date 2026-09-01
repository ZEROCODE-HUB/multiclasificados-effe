-- =====================================================================
-- 0139_denuncias_por_tipo.sql — el KPI de denuncias, separado
--
-- `admin_claims_summary` alimenta la pestaña que hasta la v15.3 se llamaba
-- "Reclamos" en Reportes. Contaba `reports` ENTERA, y `reports` guarda dos cosas
-- que no se moderan igual ni las mira la misma persona:
--
--   * denuncias sobre AVISOS    → Gestión de avisos → Reportados
--   * denuncias sobre PERSONAS  → Usuarios reportados
--
-- Un solo "Recibidos: 42" no dice si hay un problema de contenido publicado o de
-- gente comportándose mal, que son dos conversaciones distintas. Hoy en
-- producción son 21 y 21, y leerlo junto lo esconde.
--
-- Se añaden `avisos` y `usuarios` con las mismas tres cifras. Los totales de
-- primer nivel SE CONSERVAN: si el navegador tiene la versión anterior en caché
-- cuando esto se aplique, la pantalla sigue funcionando en vez de enseñar ceros.
--
-- `create or replace` conserva la firma y el tipo de retorno, así que NO pierde
-- los permisos (eso solo pasa con DROP + CREATE, ver la 0136). Aun así se
-- reescriben abajo, porque hay algo que corregir.
--
-- Idempotente.
-- =====================================================================

create or replace function public.admin_claims_summary(
  p_from date default null,
  p_to   date default null
)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  with en_rango as (
    select r.status, r.target_type
      from public.reports r
     where (p_from is null or r.created_at >= p_from)
       and (p_to   is null or r.created_at <  (p_to + 1))
  ),
  -- Un solo recorrido de la tabla en vez de los tres `select count(*)` que
  -- había, más los dos nuevos: eran cinco pasadas para lo mismo.
  cifras as (
    select
      count(*)                                             as recibidos,
      count(*) filter (where status in ('open','reviewing')) as pendientes,
      count(*) filter (where status = 'resolved')            as solucionados,
      count(*) filter (where target_type = 'listing')        as av_recibidos,
      count(*) filter (where target_type = 'listing' and status in ('open','reviewing')) as av_pendientes,
      count(*) filter (where target_type = 'listing' and status = 'resolved')            as av_solucionados,
      count(*) filter (where target_type = 'user')           as us_recibidos,
      count(*) filter (where target_type = 'user' and status in ('open','reviewing'))    as us_pendientes,
      count(*) filter (where target_type = 'user' and status = 'resolved')               as us_solucionados
    from en_rango
  )
  select case when not public.is_staff(auth.uid()) then '{}'::jsonb else
    jsonb_build_object(
      -- Los totales de siempre, para no romper un navegador con la versión vieja.
      'recibidos',    c.recibidos,
      'pendientes',   c.pendientes,
      'solucionados', c.solucionados,
      'avisos', jsonb_build_object(
        'recibidos', c.av_recibidos, 'pendientes', c.av_pendientes, 'solucionados', c.av_solucionados),
      'usuarios', jsonb_build_object(
        'recibidos', c.us_recibidos, 'pendientes', c.us_pendientes, 'solucionados', c.us_solucionados),
      -- La tendencia se queda en el total: cuatro barras por mes en vez de dos
      -- se lee peor de lo que informa. El desglose está en las cifras de arriba.
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
  end
  from cifras c;
$$;

-- La función tenía EXECUTE para PUBLIC, o sea que cualquiera con la llave
-- anónima —que viaja en el paquete de la web— podía llamarla. No filtraba nada
-- porque la guarda `is_staff` devuelve '{}', pero un KPI del panel no tiene por
-- qué estar al alcance de nadie sin sesión. Nadie fuera del navegador la usa: no
-- la llama ninguna Edge Function.
revoke execute on function public.admin_claims_summary(date, date) from public, anon;
grant  execute on function public.admin_claims_summary(date, date) to authenticated;

comment on function public.admin_claims_summary(date, date) is
  'KPI de la pestaña "Denuncias" de Reportes. Cuenta la tabla `reports` (denuncias '
  'de avisos Y de usuarios), NO el Libro de Reclamaciones, que es `complaints`. '
  'Devuelve los totales y el desglose en `avisos` / `usuarios`.';
