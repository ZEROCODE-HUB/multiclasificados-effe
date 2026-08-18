-- =====================================================================
-- 0115_videos_en_el_aviso.sql — hasta tres vídeos cortos por aviso.
--
-- Un vídeo de veinte segundos enseña un departamento o un auto mejor que seis
-- fotos, y es el formato con el que la gente ya está acostumbrada a mirar. Se
-- cobra como el PDF: un adicional más, con su precio editable desde el panel.
--
-- Decisiones que conviene tener escritas:
--
--   · El bucket es PÚBLICO, al revés que el de los PDF. Un <video> con URL
--     firmada caduca a la mitad de la reproducción y el reproductor se queda
--     colgado sin explicación. Lo que se sube aquí va en un aviso público.
--
--   · Con tope de tamaño y lista de tipos EN EL SERVIDOR. Los buckets viejos
--     (`listing-images`, `listing-docs`) se crearon sin ninguno de los dos: el
--     límite de 500 KB del PDF vive solo en el navegador, o sea que no existe.
--     De paso se les pone aquí.
--
--   · La duración (20 s) NO se puede comprobar en la base: hace falta leer el
--     archivo. Se valida en el cliente y el tope de tamaño acota el daño de lo
--     que se cuele.
--
--   · No se guarda miniatura, por decisión del cliente.
--
-- Ojo con `search_listings`: vuelve a cambiar de firma la vista, así que hay que
-- eliminar la función anterior EXACTA (la de 13 argumentos que dejó la 0114) y
-- recrearla entera.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- 1. El precio del vídeo ----------
-- `effe_extras_total` recorre las claves de la TARIFA, así que basta con que
-- exista aquí para que el servidor la cobre. Los DOS literales (el del select y
-- el del respaldo) tienen que llevarla: si se olvida uno, una base sin fila
-- activa cobraría de menos.
create or replace function public.effe_pricing()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'base',         coalesce(p.base::double precision, 16.14),
        'descPorAviso', coalesce(p.desc_por_aviso::double precision, 0.06),
        'descCantidad', case
                          when jsonb_typeof(p.desc_cantidad) = 'array'
                           and jsonb_array_length(p.desc_cantidad) > 0
                          then p.desc_cantidad
                        end,
        'saltos',       '{"15":0.14,"30":0.13,"60":0.12,"90":0.11}'::jsonb
                          || coalesce(p.saltos, '{}'::jsonb),
        'extras',       '{"img100":0,"img500":5,"pdf100":0,"pdf500":5,
                          "urgente":5,"destacado":5,"confidencial":0,"video20":5}'::jsonb
                          || coalesce(p.extras, '{}'::jsonb)
      )
      from public.pricing_settings p
      where p.is_active
      order by p.updated_at desc nulls last
      limit 1
    ),
    '{"base":16.14,"descPorAviso":0.06,
      "descCantidad":[0,0,0.06,0.06,0.06,0.06,0.06,0.06,0.06,0.06,0.06],
      "saltos":{"15":0.14,"30":0.13,"60":0.12,"90":0.11},
      "extras":{"img100":0,"img500":5,"pdf100":0,"pdf500":5,
                "urgente":5,"destacado":5,"confidencial":0,"video20":5}}'::jsonb
  );
$$;

-- La tarifa vigente gana la clave nueva, para que el panel la muestre y se pueda
-- cambiar sin tocar código. Si ya la tiene, se respeta lo que haya puesto el
-- administrador.
update public.pricing_settings
   set extras = '{"video20":5}'::jsonb || coalesce(extras, '{}'::jsonb)
 where is_active and not (coalesce(extras, '{}'::jsonb) ? 'video20');

-- ---------- 2. El bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-videos', 'listing-videos', true, 15728640,
        array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update
  set public = true,
      file_size_limit = 15728640,
      allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm'];

drop policy if exists "listing_videos_public_read" on storage.objects;
create policy "listing_videos_public_read" on storage.objects for select
  using (bucket_id = 'listing-videos');

drop policy if exists "listing_videos_insert_own" on storage.objects;
create policy "listing_videos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "listing_videos_update_own" on storage.objects;
create policy "listing_videos_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'listing-videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "listing_videos_delete_own" on storage.objects;
create policy "listing_videos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-videos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Los buckets viejos, con los límites que hasta hoy solo existían en el cliente.
update storage.buckets
   set file_size_limit = 512000, allowed_mime_types = array['application/pdf']
 where id = 'listing-docs';
update storage.buckets
   set file_size_limit = 10485760,
       -- Sin whitelist estricta de formatos: iOS sube HEIC y Android WebP, y
       -- rechazar por tipo dejaría a media plataforma sin poder subir su foto.
       allowed_mime_types = null
 where id = 'listing-images';

-- ---------- 3. Los vídeos del aviso ----------
create table if not exists public.listing_videos (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  storage_path  text not null,
  url           text not null,
  /** Duración medida en el navegador al subirlo. Informativa. */
  duration_seconds numeric(5,2),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (listing_id, sort_order)
);

create index if not exists listing_videos_listing_idx on public.listing_videos (listing_id);

comment on table public.listing_videos is
  'Vídeos cortos de un aviso (hasta 3, de 20 s). El archivo vive en el bucket '
  'público listing-videos. No se guarda miniatura, por decisión de producto.';

alter table public.listing_videos enable row level security;

-- Lectura: la misma regla que las imágenes — si el aviso se puede ver, sus
-- vídeos también.
drop policy if exists "listing_videos_select" on public.listing_videos;
create policy "listing_videos_select" on public.listing_videos for select
  using (
    exists (
      select 1 from public.listings l
       where l.id = listing_videos.listing_id
         and (l.status = 'active' or l.owner_id = auth.uid() or public.is_staff(auth.uid()))
    )
  );

drop policy if exists "listing_videos_write_own" on public.listing_videos;
create policy "listing_videos_write_own" on public.listing_videos for all to authenticated
  using (
    exists (select 1 from public.listings l
             where l.id = listing_videos.listing_id and l.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.listings l
             where l.id = listing_videos.listing_id and l.owner_id = auth.uid())
  );

grant select on public.listing_videos to anon, authenticated;
grant insert, update, delete on public.listing_videos to authenticated;

-- ---------- 4. La tarjeta sabe si el aviso trae vídeo ----------
drop function if exists public.search_listings(text, text, uuid, numeric, numeric, public.currency, text, text, int, int, numeric, numeric, text);

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
    coalesce(l.country, 'PE') as country,
    (select count(*) from public.listing_videos v where v.listing_id = l.id)::int as video_count
  from public.listings l
  join public.profiles p on p.id = l.owner_id
  where l.status = 'active';

grant select on public.listing_cards to anon, authenticated;

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
    and (p_country is null or p_country = '' or coalesce(lc.country, 'PE') = p_country)
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
