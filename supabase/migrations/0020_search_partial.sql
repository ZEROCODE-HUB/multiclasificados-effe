-- =====================================================================
-- 0020_search_partial.sql — Buscador con coincidencia parcial (ILIKE) además
-- del full-text, para que "bell" encuentre "BELLEZA". (idempotente)
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
  p_offset       int default 0
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
    and (
      p_lat is null or p_lng is null or p_radius_km is null
      or (lc.lat is not null and lc.lng is not null
          and 6371 * acos(least(1, greatest(-1,
                cos(radians(p_lat)) * cos(radians(lc.lat)) * cos(radians(lc.lng) - radians(p_lng))
                + sin(radians(p_lat)) * sin(radians(lc.lat))
              ))) <= p_radius_km)
    )
  order by
    case when p_sort = 'price_asc'  then lc.price end asc  nulls last,
    case when p_sort = 'price_desc' then lc.price end desc nulls last,
    case when p_sort = 'views'      then lc.views end desc nulls last,
    case when p_sort = 'distance' and p_lat is not null and p_lng is not null and lc.lat is not null
      then 6371 * acos(least(1, greatest(-1,
             cos(radians(p_lat)) * cos(radians(lc.lat)) * cos(radians(lc.lng) - radians(p_lng))
             + sin(radians(p_lat)) * sin(radians(lc.lat)))))
      end asc nulls last,
    lc.published_at desc nulls last,
    lc.created_at desc
  limit greatest(0, p_limit) offset greatest(0, p_offset);
$$;
