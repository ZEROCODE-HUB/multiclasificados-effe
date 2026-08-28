-- =====================================================================
-- 0132_las_renovaciones_se_cuentan.sql
--
-- LO QUE REPORTÓ EL CLIENTE, y tenía razón:
--
--   "cada vez que se RENUEVA un aviso, se refleja correctamente en los importes
--    que se muestran, pero NO contabiliza la cantidad de avisos."
--
-- Los dos reportes por categoría y por región hacían esto:
--
--     count(distinct l.id) as avisos,          -- cuenta AVISOS
--     coalesce(sum(lr.revenue), 0) as monto    -- suma OPERACIONES
--
-- El monto viene de `listing_revenue`, que suma todos los gastos del aviso:
-- publicarlo, renovarlo y los adicionales. Así que una renovación SÍ engorda el
-- importe. Pero el conteo va por `distinct l.id`: el mismo aviso renovado cinco
-- veces sigue siendo un aviso.
--
-- Es decir, las dos columnas contaban cosas distintas y se leían como si fueran
-- la misma. Hoy hay 404 publicaciones y 10 renovaciones por S/ 1.034: ese dinero
-- aparece y las diez operaciones no.
--
-- HAY UN SEGUNDO FALLO QUE EL CLIENTE NO MENCIONA y es peor:
--
-- el filtro de fechas se aplicaba sobre `l.created_at`, la fecha en que se CREÓ
-- el aviso. Una renovación de agosto sobre un aviso de enero entraba en el
-- importe pero se filtraba por enero: pedir "los ingresos de este mes" no
-- enseñaba las renovaciones de este mes. Al filtrar por rango, el dinero
-- simplemente no cuadraba.
--
-- CÓMO QUEDA
--
--   avisos        -> avisos CREADOS en el rango
--   renovaciones  -> renovaciones OCURRIDAS en el rango
--   monto         -> ingresos OCURRIDOS en el rango
--
-- Cada columna con su propia fecha, que es lo que se espera al leerlas juntas.
--
-- Idempotente.
-- =====================================================================

-- ---------- Los gastos, uno por uno y con su fecha ----------
-- `listing_revenue` sigue existiendo (la usan otras vistas) pero ahí el gasto ya
-- viene sumado por aviso y sin fecha, así que no sirve para filtrar por rango ni
-- para distinguir una renovación de una publicación.
create or replace view public.gastos_de_avisos as
  select
    ct.listing_id,
    ct.created_at,
    abs(ct.credits) as importe,
    -- La descripción es lo único que distingue el tipo de operación. Se compara
    -- sin acentos ni mayúsculas: se ha escrito de más de una forma con los años.
    (lower(coalesce(ct.description, '')) like '%renovaci%') as es_renovacion
  from public.credit_transactions ct
  where ct.type = 'spend' and ct.listing_id is not null;

comment on view public.gastos_de_avisos is
  'Cada gasto de un aviso por separado, con su fecha y si fue una renovación. '
  'Los reportes la necesitan para poder filtrar por la fecha de la OPERACIÓN y '
  'no por la de creación del aviso.';

-- ---------- Por categoría ----------
drop function if exists public.admin_category_revenue(date, date);

create function public.admin_category_revenue(
  p_from date default null,
  p_to   date default null
)
returns table (cat text, avisos bigint, renovaciones bigint, monto numeric)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select coalesce(c.name, l.category_id) as cat, l.id, l.created_at
    from public.listings l
    left join public.categories c on c.id = l.category_id
  ),
  -- Avisos creados dentro del rango.
  creados as (
    select cat, count(*) as avisos
    from base
    where (p_from is null or created_at >= p_from)
      and (p_to   is null or created_at < (p_to + 1))
    group by cat
  ),
  -- Operaciones ocurridas dentro del rango, con SU fecha.
  movimientos as (
    select b.cat,
           count(*) filter (where g.es_renovacion) as renovaciones,
           coalesce(sum(g.importe), 0)::numeric as monto
    from public.gastos_de_avisos g
    join base b on b.id = g.listing_id
    where (p_from is null or g.created_at >= p_from)
      and (p_to   is null or g.created_at < (p_to + 1))
    group by b.cat
  )
  select
    coalesce(cr.cat, mv.cat) as cat,
    coalesce(cr.avisos, 0) as avisos,
    coalesce(mv.renovaciones, 0) as renovaciones,
    coalesce(mv.monto, 0)::numeric as monto
  from creados cr
  -- FULL JOIN y no LEFT: una categoría puede tener renovaciones en el rango sin
  -- ningún aviso creado en él, y al revés. Con un LEFT desaparecería el dinero
  -- de los avisos antiguos, que es justo el caso que se está arreglando.
  full join movimientos mv on mv.cat = cr.cat
  where public.is_staff(auth.uid())
  order by avisos desc, monto desc;
$$;

revoke execute on function public.admin_category_revenue(date, date) from public;
grant  execute on function public.admin_category_revenue(date, date) to authenticated;

comment on function public.admin_category_revenue(date, date) is
  'Avisos, renovaciones e ingresos por categoría. Los avisos se filtran por su '
  'fecha de creación; las renovaciones y el monto, por la fecha de la operación.';

-- ---------- Por región ----------
drop function if exists public.admin_region_distribution(date, date);

create function public.admin_region_distribution(
  p_from date default null,
  p_to   date default null
)
returns table (reg text, avisos bigint, renovaciones bigint, monto numeric)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select coalesce(nullif(initcap(trim(split_part(l.location, ',', 1))), ''), 'Sin ubicación') as reg,
           l.id, l.created_at
    from public.listings l
  ),
  creados as (
    select reg, count(*) as avisos
    from base
    where (p_from is null or created_at >= p_from)
      and (p_to   is null or created_at < (p_to + 1))
    group by reg
  ),
  movimientos as (
    select b.reg,
           count(*) filter (where g.es_renovacion) as renovaciones,
           coalesce(sum(g.importe), 0)::numeric as monto
    from public.gastos_de_avisos g
    join base b on b.id = g.listing_id
    where (p_from is null or g.created_at >= p_from)
      and (p_to   is null or g.created_at < (p_to + 1))
    group by b.reg
  )
  select
    coalesce(cr.reg, mv.reg) as reg,
    coalesce(cr.avisos, 0) as avisos,
    coalesce(mv.renovaciones, 0) as renovaciones,
    coalesce(mv.monto, 0)::numeric as monto
  from creados cr
  full join movimientos mv on mv.reg = cr.reg
  where public.is_staff(auth.uid())
  order by avisos desc, monto desc
  limit 8;
$$;

revoke execute on function public.admin_region_distribution(date, date) from public;
grant  execute on function public.admin_region_distribution(date, date) to authenticated;

comment on function public.admin_region_distribution(date, date) is
  'Avisos, renovaciones e ingresos por región. Mismo criterio de fechas que '
  'admin_category_revenue.';
