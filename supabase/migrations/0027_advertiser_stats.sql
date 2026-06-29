-- =====================================================================
-- 0027_advertiser_stats.sql — REQ-08: estadísticas reales del anunciante
-- Una sola RPC que devuelve totales, desglose por aviso y tendencia 30 días
-- para los avisos del usuario actual. Idempotente.
-- =====================================================================

create or replace function public.advertiser_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_totals   jsonb;
  v_listings jsonb;
  v_trend    jsonb;
begin
  if uid is null then
    return jsonb_build_object('totals', '{}'::jsonb, 'listings', '[]'::jsonb, 'trend', '[]'::jsonb);
  end if;

  -- Totales globales
  select jsonb_build_object(
    'views', coalesce((
      select count(*) from public.listing_events e
      join public.listings l on l.id = e.listing_id
      where l.owner_id = uid and e.type = 'view'), 0),
    'contacts', coalesce((
      select count(*) from public.listing_events e
      join public.listings l on l.id = e.listing_id
      where l.owner_id = uid and e.type in ('contact_click', 'phone_click')), 0),
    'messages', coalesce((
      select count(*) from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where c.seller_id = uid and m.sender_id <> uid), 0),
    'applications', coalesce((
      select count(*) from public.job_applications a
      join public.listings l on l.id = a.listing_id
      where l.owner_id = uid), 0)
  ) into v_totals;

  -- Desglose por aviso (top 8 por vistas)
  select coalesce(jsonb_agg(r.row), '[]'::jsonb) into v_listings
  from (
    select jsonb_build_object(
      'title', l.title,
      'views', count(*) filter (where e.type = 'view'),
      'contacts', count(*) filter (where e.type in ('contact_click', 'phone_click'))
    ) as row,
    count(*) filter (where e.type = 'view') as vcount
    from public.listings l
    left join public.listing_events e on e.listing_id = l.id
    where l.owner_id = uid
    group by l.id, l.title
    order by vcount desc
    limit 8
  ) r;

  -- Tendencia de los últimos 30 días (por día)
  select coalesce(jsonb_agg(jsonb_build_object('day', t.d, 'vistas', t.v, 'contactos', t.cc) order by t.d), '[]'::jsonb)
  into v_trend
  from (
    select date_trunc('day', e.created_at)::date as d,
      count(*) filter (where e.type = 'view') as v,
      count(*) filter (where e.type in ('contact_click', 'phone_click')) as cc
    from public.listing_events e
    join public.listings l on l.id = e.listing_id
    where l.owner_id = uid and e.created_at >= now() - interval '30 days'
    group by 1
  ) t;

  return jsonb_build_object('totals', v_totals, 'listings', v_listings, 'trend', v_trend);
end;
$$;

grant execute on function public.advertiser_stats() to authenticated;
