-- =====================================================================
-- 0084_listing_department.sql — el aviso guarda su DEPARTAMENTO y el buscador
-- filtra por él.
--
-- Cambio de criterio de producto: la ubicación se filtra por departamento, que
-- es exacto y predecible —eliges Lima y ves Lima— en vez de por distancia. Nadie
-- tiene que entender radios, y ningún aviso queda escondido por estar unos
-- kilómetros más lejos.
--
-- Lima y Callao comparten código ('15') a propósito: políticamente son dos
-- departamentos, pero en la práctica son la misma ciudad y Bellavista está a
-- 11 km del centro de Lima. Separarlos haría que quien elige Lima no viera
-- avisos que tiene cruzando la avenida.
--
-- Las coordenadas (lat/lng) se conservan: alimentan el mapa de la ficha y el del
-- buscador. Lo que ya no hacen es decidir qué avisos se ven.
--
-- Sustituye a la migración 0080 (prioridad por cercanía en kilómetros), que
-- queda sin efecto: la prioridad de Urgente y Destacado pasa a acotarse por
-- departamento, que es más simple y hace lo mismo.
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

alter table public.listings
  add column if not exists department text;

comment on column public.listings.department is
  'Código de departamento del INEI (2 dígitos). ''15'' agrupa Lima y Callao. '
  'Es el criterio por el que se filtra la ubicación en el buscador.';

create index if not exists listings_department_idx
  on public.listings (department) where department is not null;

-- ---------- Departamento de los avisos ya publicados ----------
-- Se deduce del texto que escribieron sus dueños ("Miraflores, Lima").
-- Se compara por PALABRA COMPLETA: "Limatambo" es del Cusco, no de Lima.
--
-- Es un primer intento, no la verdad: el texto es una redacción, y hay nombres
-- de distrito que llevan dentro el de otro departamento ("San Martín de Porres"
-- está en Lima). La 0086 corrige eso con el punto que marcó el anunciante en el
-- mapa, que sí es un dato. Aquí queda lo que se puede sacar sin salir de la BD.
do $$
declare
  v_dep record;
  v_actualizados int;
  v_pendientes   int;
begin
  for v_dep in
    select * from (values
      ('01','amazonas'), ('02','ancash'), ('03','apurimac'), ('04','arequipa'),
      ('05','ayacucho'), ('06','cajamarca'), ('08','cusco'), ('08','cuzco'),
      ('09','huancavelica'),
      ('10','huanuco'), ('11','ica'), ('12','junin'), ('13','la libertad'),
      ('14','lambayeque'), ('15','lima'), ('15','callao'), ('16','loreto'),
      ('17','madre de dios'), ('18','moquegua'), ('19','pasco'), ('20','piura'),
      ('21','puno'), ('22','san martin'), ('23','tacna'), ('24','tumbes'),
      ('25','ucayali')
    ) as t(id, nombre)
  loop
    update public.listings l
       set department = v_dep.id
     where l.department is null
       and (
         -- El nombre, como palabra suelta y sin tildes.
         ' ' || regexp_replace(
                  lower(translate(coalesce(l.location,''),
                                  'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),
                  '[^a-z0-9]+', ' ', 'g') || ' '
         like '% ' || v_dep.nombre || ' %'
       );
  end loop;

  get diagnostics v_actualizados = row_count;
  select count(*) into v_pendientes from public.listings where department is null;
  raise notice 'Avisos sin departamento tras deducirlo del texto: % (habrá que corregirlos a mano)', v_pendientes;
end $$;

-- ---------- La vista del buscador expone el departamento ----------
-- La columna va al final: `create or replace view` no admite reordenar ni
-- cambiar las que ya existen.
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
    l.department
  from public.listings l
  join public.profiles p on p.id = l.owner_id
  where l.status = 'active';

grant select on public.listing_cards to anon, authenticated;

-- ---------- Buscador ----------
-- Frente a la versión anterior (0055):
--   · nuevo p_department: filtra por igualdad, sin ambigüedad;
--   · los avisos Urgente y Destacado encabezan SOLO si son del departamento que
--     está mirando el usuario. Un urgente de Piura no le sirve a quien busca en
--     Trujillo, pero sigue apareciendo: pierde el privilegio, no la visibilidad;
--   · desaparecen p_lat/p_lng/p_radius_km: la distancia ya no decide nada.
-- Se retiran todas las firmas anteriores: si quedara alguna, una llamada con
-- parámetros por defecto sería ambigua y Postgres la rechazaría.
drop function if exists public.search_listings(text, text, uuid, numeric, numeric, public.currency, numeric, numeric, numeric, text, int, int);
drop function if exists public.search_listings(text, text, uuid, numeric, numeric, public.currency, numeric, numeric, numeric, text, int, int, numeric);
drop function if exists public.search_listings(text, text, uuid, numeric, numeric, public.currency, text, text, int, int, numeric, numeric);

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
    -- Filtro de ubicación: exacto. Sin departamento elegido, se ve todo el país.
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
    lc.published_at desc nulls last,
    lc.created_at desc
  limit greatest(0, p_limit) offset greatest(0, p_offset);
$$;

comment on function public.search_listings is
  'Buscador público. p_department: código INEI de 2 dígitos (''15'' = Lima y '
  'Callao); sin él se busca en todo el país.';
