-- =====================================================================
-- 0114_avisos_de_otros_paises.sql — un aviso puede estar fuera del Perú.
--
-- Toda la app daba por hecho que sí: el mapa restringe las direcciones a Perú,
-- la ubicación se guarda como código de departamento del INEI y el buscador
-- filtra por él. Eso deja fuera a quien anuncia desde el extranjero o para el
-- extranjero, y a quien está fuera y quiere ver lo de su país.
--
-- La columna nueva es deliberadamente simple: el código ISO del país y nada
-- más. NO se añaden divisiones internas de otros países —ni estados, ni
-- provincias, ni departamentos— porque mantener ese catálogo para veinte países
-- es un proyecto en sí mismo y el cliente pidió expresamente solo el país. Fuera
-- del Perú, la ubicación fina es el texto libre que ya existe.
--
-- `department` (INEI) SOLO tiene sentido con country = 'PE'.
--
-- Ojo con `search_listings`: cambia su firma, así que hay que eliminar la
-- anterior EXACTA antes de crearla. Si quedaran las dos, una llamada con
-- parámetros por defecto sería ambigua y Postgres la rechazaría — y el `catch`
-- del cliente se lo tragaría dejando el buscador vacío en silencio.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

alter table public.listings add column if not exists country text not null default 'PE';

comment on column public.listings.country is
  'País del aviso (ISO-3166-1 alpha-2). Por defecto PE. `department` (código '
  'INEI) solo aplica cuando country = ''PE''.';

create index if not exists listings_country_idx on public.listings (country);

-- ---------- La vista expone el país ----------
-- La columna va AL FINAL: `create or replace view` no admite reordenar ni
-- cambiar las que ya existen.
drop function if exists public.search_listings(text, text, uuid, numeric, numeric, public.currency, text, text, int, int, numeric, numeric);

create or replace view public.listing_cards as
  select
    l.id,
    l.owner_id,
    l.title,
    l.description,
    l.price,
    l.currency,
    l.condition,
    l.category_id,
    l.subcategory_id,
    l.location,
    l.lat,
    l.lng,
    l.status,
    l.featured,
    l.urgent,
    l.confidential,
    l.views,
    l.published_at,
    l.created_at,
    l.expires_at,
    p.full_name as advertiser,
    p.rating    as advertiser_rating,
    (select li.url from public.listing_images li
       where li.listing_id = l.id order by li.sort_order limit 1) as image_url,
    l.department,
    coalesce(p.verified, false) as advertiser_verified,
    coalesce(l.country, 'PE') as country
  from public.listings l
  join public.profiles p on p.id = l.owner_id
  where l.status = 'active';

grant select on public.listing_cards to anon, authenticated;

-- ---------- Buscador ----------
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
  p_lat          numeric default null,
  p_lng          numeric default null,
  p_country      text default 'PE'
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
    -- País: sin él (null o '') se busca en todo el mundo. Los avisos de siempre
    -- son PE, así que quien no toque el filtro ve exactamente lo de antes.
    and (p_country is null or p_country = '' or coalesce(lc.country, 'PE') = p_country)
    -- El departamento del INEI solo distingue dentro del Perú; fuera, el
    -- cliente no lo manda.
    and (p_department is null or p_department = '' or lc.department = p_department)
  order by
    (coalesce(lc.urgent, false)
      and (p_department is null or p_department = '' or lc.department = p_department)) desc,
    (coalesce(lc.featured, false)
      and (p_department is null or p_department = '' or lc.department = p_department)) desc,
    case when p_sort = 'price_asc'  then lc.price end asc  nulls last,
    case when p_sort = 'price_desc' then lc.price end desc nulls last,
    case when p_sort = 'views'      then lc.views end desc nulls last,
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
  'Buscador público. p_country: código ISO-3166-1 alpha-2 (''PE'' por defecto). '
  'p_department: código INEI de 2 dígitos (''15'' = Lima y Callao), solo dentro '
  'del Perú. p_lat/p_lng: ubicación del dispositivo, solo para ordenar con '
  'p_sort = ''distance''; nunca filtran.';
