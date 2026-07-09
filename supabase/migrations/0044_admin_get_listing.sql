-- =====================================================================
-- 0044_admin_get_listing.sql — El moderador ve el aviso denunciado.
--
-- Desde el panel de denuncias no había forma de inspeccionar la publicación
-- reportada. La vista `listing_cards` no sirve: filtra `status = 'active'`, así
-- que en cuanto el aviso se deshabilita (que es justo lo que suele pasar con
-- uno denunciado) deja de verse. Y `admin_list_listings` no trae ni la
-- descripción ni las imágenes.
--
-- Este RPC devuelve el aviso completo, en cualquier estado, solo para staff.
-- Idempotente.
-- =====================================================================

create or replace function public.admin_get_listing(p_id uuid)
returns table (
  id uuid, title text, description text, price numeric, currency text,
  condition text, category_id text, subcategory_id text, location text,
  status text, featured boolean, urgent boolean, views int,
  rejection_reason text, published_at timestamptz, created_at timestamptz,
  advertiser text, advertiser_id uuid, images text[]
)
language sql security definer set search_path = public as $$
  select
    l.id, l.title, l.description, l.price, l.currency::text,
    l.condition::text, l.category_id, l.subcategory_id, l.location,
    l.status::text, l.featured, l.urgent, l.views,
    l.rejection_reason, l.published_at, l.created_at,
    p.full_name, l.owner_id,
    coalesce(
      (select array_agg(li.url order by li.sort_order)
         from public.listing_images li
        where li.listing_id = l.id),
      '{}'::text[]
    )
  from public.listings l
  left join public.profiles p on p.id = l.owner_id
  where public.is_staff(auth.uid())
    and l.id = p_id;
$$;

grant execute on function public.admin_get_listing(uuid) to authenticated;
