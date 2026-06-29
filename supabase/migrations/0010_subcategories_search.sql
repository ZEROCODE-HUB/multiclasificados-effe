-- =====================================================================
-- 0010_subcategories_search.sql — REQ-02: subcategorías + buscador con
-- filtros combinados (precio, ubicación por radio KM, orden) (idempotente)
-- =====================================================================

-- ---------- subcategorías ----------
create table if not exists public.subcategories (
  id          uuid primary key default gen_random_uuid(),
  category_id text not null references public.categories (id) on delete cascade,
  name        text not null,
  slug        text not null,
  sort_order  int not null default 0,
  active      boolean not null default true,
  unique (category_id, slug)
);

alter table public.listings add column if not exists subcategory_id uuid references public.subcategories (id);

-- ---------- seed de subcategorías comunes ----------
insert into public.subcategories (category_id, name, slug, sort_order) values
  ('inmuebles', 'Departamentos', 'departamentos', 1),
  ('inmuebles', 'Casas', 'casas', 2),
  ('inmuebles', 'Terrenos', 'terrenos', 3),
  ('inmuebles', 'Oficinas', 'oficinas', 4),
  ('vehiculos', 'Autos', 'autos', 1),
  ('vehiculos', 'Camionetas', 'camionetas', 2),
  ('vehiculos', 'Motos', 'motos', 3),
  ('empleos', 'Tiempo completo', 'tiempo-completo', 1),
  ('empleos', 'Medio tiempo', 'medio-tiempo', 2),
  ('empleos', 'Freelance', 'freelance', 3),
  ('tecnologia', 'Celulares', 'celulares', 1),
  ('tecnologia', 'Computadoras', 'computadoras', 2),
  ('servicios', 'Hogar', 'hogar', 1),
  ('servicios', 'Profesionales', 'profesionales', 2)
on conflict (category_id, slug) do nothing;

-- ---------- RLS subcategorías ----------
alter table public.subcategories enable row level security;
drop policy if exists "subcategories_select_all" on public.subcategories;
create policy "subcategories_select_all" on public.subcategories for select using (true);
drop policy if exists "subcategories_manage_staff" on public.subcategories;
create policy "subcategories_manage_staff" on public.subcategories for all
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- índice para filtros geográficos
create index if not exists listings_geo_idx on public.listings (lat, lng);

-- ---------- Buscador con filtros combinados (REQ-02) ----------
-- Distancia por fórmula de Haversine (km). Devuelve avisos activos.
-- p_sort: recent | price_asc | price_desc | views | distance
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
returns setof public.listings
language sql
stable
as $$
  select l.*
  from public.listings l
  where l.status = 'active'
    and (p_query is null or p_query = '' or
         to_tsvector('spanish', coalesce(l.title, '') || ' ' || coalesce(l.description, ''))
           @@ plainto_tsquery('spanish', p_query))
    and (p_category is null or l.category_id = p_category)
    and (p_subcategory is null or l.subcategory_id = p_subcategory)
    and (p_price_min is null or l.price >= p_price_min)
    and (p_price_max is null or l.price <= p_price_max)
    and (p_currency is null or l.currency = p_currency)
    and (
      p_lat is null or p_lng is null or p_radius_km is null
      or (l.lat is not null and l.lng is not null
          and 6371 * acos(least(1, greatest(-1,
                cos(radians(p_lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(p_lng))
                + sin(radians(p_lat)) * sin(radians(l.lat))
              ))) <= p_radius_km)
    )
  order by
    case when p_sort = 'price_asc'  then l.price end asc  nulls last,
    case when p_sort = 'price_desc' then l.price end desc nulls last,
    case when p_sort = 'views'      then l.views end desc nulls last,
    case when p_sort = 'distance' and p_lat is not null and p_lng is not null and l.lat is not null
      then 6371 * acos(least(1, greatest(-1,
             cos(radians(p_lat)) * cos(radians(l.lat)) * cos(radians(l.lng) - radians(p_lng))
             + sin(radians(p_lat)) * sin(radians(l.lat)))))
      end asc nulls last,
    l.published_at desc nulls last,
    l.created_at desc
  limit greatest(0, p_limit) offset greatest(0, p_offset);
$$;
