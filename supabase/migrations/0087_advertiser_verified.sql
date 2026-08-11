-- =====================================================================
-- 0087_advertiser_verified.sql — el sello "Verificado" de la tarjeta pasa a
-- significar algo.
--
-- Hasta ahora el sello estaba escrito a pelo en la tarjeta y en la ficha: salía
-- en TODOS los avisos, siempre, sin condición. Era decoración con pinta de
-- información, que es lo peor de las dos cosas: quien lo ve cree que alguien
-- comprobó algo.
--
-- A partir de aquí el sello sale solo si el anunciante tiene `profiles.verified`,
-- que es la decisión del equipo de administración (RPC admin_verify_user, botón
-- de Administración → Usuarios). Es lo que ya prometía la propia app en Ajustes:
-- «La verificación la realiza el equipo de administración».
--
-- Dos partes:
--   1. la vista expone `advertiser_verified`, para que la tarjeta pueda saberlo;
--   2. se corrige el dato: hoy `verified` se ponía SOLO en el admin, pero también
--      —sin querer— al publicar tras validar el DNI/RUC en Factiliza. Eso hacía
--      que casi cualquiera que hubiese publicado apareciera como verificado. Se
--      quita del código (src/lib/publish.ts) y aquí se limpia lo ya guardado.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- 1. La vista expone si el anunciante está verificado ----------
-- Hay que retirar antes el buscador: devuelve `setof public.listing_cards`, así
-- que depende del tipo de la vista y bloquearía el reemplazo.
drop function if exists public.search_listings(text, text, uuid, numeric, numeric, public.currency, text, text, int, int, numeric, numeric);

-- La columna nueva va al final: `create or replace view` no admite reordenar.
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
    -- Sello de confianza del anunciante, puesto a mano por el equipo.
    coalesce(p.verified, false) as advertiser_verified
  from public.listings l
  join public.profiles p on p.id = l.owner_id
  where l.status = 'active';

grant select on public.listing_cards to anon, authenticated;

-- ---------- El buscador, igual que en la 0085 ----------
-- Se vuelve a crear sin cambios: solo se retiró para poder tocar la vista.
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
  'Buscador público. p_department: código INEI de 2 dígitos (''15'' = Lima y '
  'Callao) y único filtro de ubicación. p_lat/p_lng: ubicación del dispositivo, '
  'solo para ordenar con p_sort = ''distance''; nunca filtran.';

comment on column public.profiles.verified is
  'Sello de confianza, decidido por el equipo de administración '
  '(admin_verify_user). NO es "validó su DNI": eso se sabe por doc_number. '
  'Es lo que enseña el sello «Verificado» de las tarjetas de aviso.';

-- ---------- 2. Dejar `verified` solo en quien lo aprobó un administrador ----------
-- Quién cuenta como aprobado se saca de la propia auditoría: admin_verify_user
-- registra cada decisión en audit_logs ('verify_user', metadata.verified). Se
-- respeta la ÚLTIMA de cada usuario, que puede ser una retirada del sello.
--
-- A todos los demás se les quita: su `verified` venía de publicar tras validar
-- el documento, que no es lo mismo. No se pierde nada comprobable — el documento
-- sigue en profiles.doc_type / doc_number— y el admin puede volver a poner el
-- sello a quien corresponda.
do $$
declare
  v_quitados int;
begin
  with ultima_decision as (
    select distinct on (a.entity_id)
           a.entity_id                                        as user_id,
           coalesce((a.metadata ->> 'verified')::boolean, false) as verificado
      from public.audit_logs a
     where a.action = 'verify_user'
       and a.entity_type = 'user'
       and a.entity_id is not null
     order by a.entity_id, a.created_at desc
  )
  update public.profiles p
     set verified = false
   where p.verified
     and not exists (
       select 1 from ultima_decision u
        where u.user_id = p.id::text and u.verificado
     );

  get diagnostics v_quitados = row_count;
  raise notice 'Sellos retirados (los ponía la publicación, no el admin): %', v_quitados;
end $$;
