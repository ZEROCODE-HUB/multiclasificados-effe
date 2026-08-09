-- =====================================================================
-- 0080_search_priority_by_zone.sql — los Urgente/Destacado encabezan la
-- búsqueda SOLO si son de la zona de quien está mirando.
--
-- Hasta ahora (0055) un aviso Urgente salía primero en todo el Perú: quien
-- buscaba desde Trujillo veía arriba avisos de Piura o Lima que no le sirven de
-- nada. La prioridad por modalidad sigue intacta, pero se aplica dentro de la
-- zona del usuario; los de fuera conservan su insignia y compiten en el orden
-- normal.
--
-- Cómo se decide "de mi zona": la distancia entre el aviso y el punto que manda
-- el buscador (la zona elegida a mano o el GPS) es menor o igual que
-- p_priority_km. El valor por defecto (60 km) cubre una ciudad y sus alrededores
-- sin dejar fuera al que vive en el borde.
--
-- Si la búsqueda NO trae punto —usuario sin zona ni permiso de ubicación—, todo
-- se comporta exactamente como antes: los destacados van primero, sin más.
--
-- Cambia además el uso de p_lat/p_lng: ahora el buscador los manda aunque no
-- filtre por radio, así que esconder lo de fuera pasa a depender SOLO de que
-- venga p_radius_km.
--
-- La fila se arrastra como registro compuesto (`lc as fila` … `(fila).*`) para
-- no tener que repetir aquí la lista de columnas de listing_cards: así esta
-- función no se rompe si mañana la vista gana una columna.
-- Idempotente (reemplaza la función).
-- =====================================================================

create or replace function public.search_listings(
  p_query        text default null,
  p_category     text default null,
  p_subcategory  uuid default null,
  p_price_min    numeric default null,
  p_price_max    numeric default null,
  p_currency     public.currency default null,
  p_lat          numeric default null,
  p_lng          numeric default null,
  p_radius_km    numeric default null,
  p_sort         text default 'recent',
  p_limit        int default 24,
  p_offset       int default 0,
  p_priority_km  numeric default 60
)
returns setof public.listing_cards
language sql
stable
as $$
  with base as (
    select
      lc as fila,
      -- Distancia en km al punto de referencia (null si no hay punto o el aviso
      -- no tiene coordenadas). El mismo haversine de siempre.
      case
        when p_lat is null or p_lng is null or lc.lat is null or lc.lng is null then null
        else 6371 * acos(least(1, greatest(-1,
               cos(radians(p_lat)) * cos(radians(lc.lat)) * cos(radians(lc.lng) - radians(p_lng))
               + sin(radians(p_lat)) * sin(radians(lc.lat)))))
      end as distancia_km
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
  )
  select (b.fila).*
  from base b
  where
    -- El radio ya no se "activa" por venir el punto: si no se pide radio, no se
    -- esconde nada aunque se sepa dónde está el usuario.
    p_radius_km is null or p_lat is null or p_lng is null
    or (b.distancia_km is not null and b.distancia_km <= p_radius_km)
  order by
    -- Prioridad por modalidad, acotada a la zona de quien busca. Sin punto de
    -- referencia todo cuenta como "mi zona" y el orden queda como antes.
    (coalesce((b.fila).urgent, false)
      and (p_lat is null or p_lng is null
           or (b.distancia_km is not null and b.distancia_km <= p_priority_km))) desc,
    (coalesce((b.fila).featured, false)
      and (p_lat is null or p_lng is null
           or (b.distancia_km is not null and b.distancia_km <= p_priority_km))) desc,
    -- Dentro de cada grupo, el orden elegido por el usuario.
    case when p_sort = 'price_asc'  then (b.fila).price end asc  nulls last,
    case when p_sort = 'price_desc' then (b.fila).price end desc nulls last,
    case when p_sort = 'views'      then (b.fila).views end desc nulls last,
    case when p_sort = 'distance'   then b.distancia_km end asc nulls last,
    (b.fila).published_at desc nulls last,
    (b.fila).created_at desc
  limit greatest(0, p_limit) offset greatest(0, p_offset);
$$;

comment on function public.search_listings is
  'Buscador público. p_lat/p_lng: desde dónde se mide (zona del usuario o GPS); '
  'p_radius_km: opcional, esconde lo que quede fuera; p_priority_km: hasta dónde '
  'llega la prioridad de Urgente/Destacado (60 km por defecto).';
