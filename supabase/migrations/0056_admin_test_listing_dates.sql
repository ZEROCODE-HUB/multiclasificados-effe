-- =====================================================================
-- 0056_admin_test_listing_dates.sql — Herramienta de PRUEBA (superadmin)
-- Permite mover la fecha de publicación de un aviso para testear la
-- caducidad de las distintas duraciones sin esperar días reales.
--
-- Al cambiar la fecha de publicación se CONSERVA la duración configurada
-- del aviso (expires_at - published_at) y se recalcula expires_at. Si la
-- nueva vigencia ya pasó, el aviso queda 'expired' (Vencido) al instante
-- —igual que haría el cron `expire_listings`, pero sin esperarlo—; si
-- vuelve a estar vigente, se reactiva a 'active'.
--
-- Solo staff (is_staff). Idempotente.
-- =====================================================================

-- 1) admin_list_listings ahora devuelve también published_at y expires_at,
--    para que el panel pueda mostrar/prefijar las fechas y calcular la
--    duración configurada del aviso.
drop function if exists public.admin_list_listings(text, text, int, int);
create function public.admin_list_listings(
  p_search text default null,
  p_status text default null,
  p_limit  int  default 100,
  p_offset int  default 0
) returns table (
  id uuid, title text, category_id text, status text, featured boolean,
  price numeric, currency text, advertiser text, views int,
  created_at timestamptz, published_at timestamptz, expires_at timestamptz
)
language sql security definer set search_path = public as $$
  select l.id, l.title, l.category_id, l.status::text, l.featured,
         l.price, l.currency::text, p.full_name, l.views,
         l.created_at, l.published_at, l.expires_at
  from public.listings l
  left join public.profiles p on p.id = l.owner_id
  where public.is_staff(auth.uid())
    and (p_search is null or p_search = '' or l.title ilike '%' || p_search || '%')
    and (p_status is null or p_status = '' or l.status::text = p_status)
  order by l.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
grant execute on function public.admin_list_listings(text, text, int, int) to authenticated;

-- 2) admin_set_listing_published — mueve la fecha de publicación (y creación)
--    conservando la duración, recalcula la vigencia y reevalúa el estado.
create or replace function public.admin_set_listing_published(
  p_listing      uuid,
  p_published_at timestamptz
) returns public.listings
language plpgsql security definer set search_path = public as $$
declare
  v_row      public.listings;
  v_duration interval;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_published_at is null then
    raise exception 'Fecha de publicación requerida' using errcode = '22023';
  end if;

  select * into v_row from public.listings where id = p_listing;
  if v_row.id is null then
    raise exception 'Aviso no encontrado' using errcode = 'P0002';
  end if;

  -- Duración configurada del aviso. Si aún no tenía vigencia (p. ej. borrador),
  -- usa plan_duration_days o 30 días como referencia para el cálculo.
  v_duration := coalesce(
    v_row.expires_at - v_row.published_at,
    (coalesce(v_row.plan_duration_days, 30) || ' days')::interval
  );

  update public.listings
  set created_at   = p_published_at,
      published_at = p_published_at,
      expires_at   = p_published_at + v_duration,
      -- Reevalúa la vigencia al instante (lo que haría el cron expire_listings):
      -- sólo toca avisos ya publicados (active/expired); no reactiva borradores,
      -- pausados, rechazados ni vendidos.
      status = case
                 when status in ('active', 'expired')
                   then case when p_published_at + v_duration < now()
                             then 'expired'::public.listing_status
                             else 'active'::public.listing_status end
                 else status
               end,
      -- Que el aviso "por vencer" pueda volver a notificar tras el cambio.
      expiry_notified_at = null,
      updated_at = now()
  where id = p_listing
  returning * into v_row;

  perform public.log_audit(
    'test_set_listing_published', 'listing', p_listing::text,
    jsonb_build_object(
      'published_at', p_published_at,
      'expires_at',   v_row.expires_at,
      'status',       v_row.status
    )
  );
  return v_row;
end;
$$;

revoke execute on function public.admin_set_listing_published(uuid, timestamptz) from public;
grant  execute on function public.admin_set_listing_published(uuid, timestamptz) to authenticated;
