-- =====================================================================
-- 0085_search_nearest_option.sql — "Ver los más cercanos", como opción.
--
-- El filtro de ubicación sigue siendo el DEPARTAMENTO (0084): exacto y
-- predecible. Esto añade encima algo que el usuario pide expresamente y solo
-- cuando lo pide: dentro de lo que ya está viendo, ordenar del más cercano al
-- más lejano usando la ubicación real de su dispositivo.
--
-- La diferencia con el diseño anterior (0080, retirado) es importante: la
-- distancia ya NO filtra ni decide nada por su cuenta. Solo reordena, y solo si
-- llegan p_lat/p_lng — que llegan únicamente cuando el usuario ha concedido el
-- permiso de ubicación. Sin ellos todo se comporta exactamente igual que en la
-- 0084.
--
-- Los avisos sin coordenadas van al final al ordenar por cercanía (`nulls
-- last`), nunca desaparecen.
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

drop function if exists public.search_listings(text, text, uuid, numeric, numeric, public.currency, text, text, int, int);

create or replace function public.search_listings(
  p_query        text default null,
  p_category     text default null,
  p_subcategory  uuid default null,
  p_price_min    numeric default null,
  p_price_max    numeric default null,
  p_currency     public.currency default null,
  p_department   text default null,
  p_sort         text default 'recent',
  p_limit        int default 24,
  p_offset       int default 0,
  -- Ubicación del dispositivo. Solo llegan con permiso concedido y solo se usan
  -- para ordenar cuando p_sort = 'distance'.
  p_lat          numeric default null,
  p_lng          numeric default null
)
returns setof public.listing_cards
language sql
stable
as $$
  select lc.*
  from public.listing_cards lc
  where (
      p_query is null or p_query = ''
      or to_tsvector('spanish', coalesce(lc.title, '') || ' ' || coalesce(lc.description, ''))
           @@ plainto_tsquery('spanish', p_query)
      or lc.title ilike '%' || p_query || '%'
      or lc.description ilike '%' || p_query || '%'
      or lc.location ilike '%' || p_query || '%'
    )
    and (p_category is null or lc.category_id = p_category)
    and (p_subcategory is null or lc.subcategory_id = p_subcategory)
    and (p_price_min is null or lc.price >= p_price_min)
    and (p_price_max is null or lc.price <= p_price_max)
    and (p_currency is null or lc.currency = p_currency)
    and (p_department is null or p_department = '' or lc.department = p_department)
  order by
    -- Prioridad por modalidad, acotada al departamento de quien mira.
    (coalesce(lc.urgent, false)
      and (p_department is null or p_department = '' or lc.department = p_department)) desc,
    (coalesce(lc.featured, false)
      and (p_department is null or p_department = '' or lc.department = p_department)) desc,
    case when p_sort = 'price_asc'  then lc.price end asc  nulls last,
    case when p_sort = 'price_desc' then lc.price end desc nulls last,
    case when p_sort = 'views'      then lc.views end desc nulls last,
    -- Cercanía a la ubicación del dispositivo (haversine). Los avisos sin
    -- coordenadas quedan al final, pero siguen apareciendo.
    case when p_sort = 'distance' and p_lat is not null and p_lng is not null
              and lc.lat is not null and lc.lng is not null
      then 6371 * acos(least(1, greatest(-1,
             cos(radians(p_lat)) * cos(radians(lc.lat)) * cos(radians(lc.lng) - radians(p_lng))
             + sin(radians(p_lat)) * sin(radians(lc.lat)))))
      end asc nulls last,
    lc.published_at desc nulls last,
    lc.created_at desc
  limit greatest(0, p_limit) offset greatest(0, p_offset);
$$;

comment on function public.search_listings is
  'Buscador público. p_department: código INEI de 2 dígitos (''15'' = Lima y '
  'Callao) y único filtro de ubicación. p_lat/p_lng: ubicación del dispositivo, '
  'solo para ordenar con p_sort = ''distance''; nunca filtran.';
