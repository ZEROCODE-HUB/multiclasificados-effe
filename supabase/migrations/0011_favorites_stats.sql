-- =====================================================================
-- 0011_favorites_stats.sql — REQ-03 (favoritos rápidos) + REQ-08
-- (estadísticas: vistas únicas, clics, veces guardado) (idempotente)
-- =====================================================================

-- ---------- REQ-03: toggle favorito (like/unlike en una llamada) ----------
create or replace function public.toggle_favorite(p_listing uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  delete from public.favorites where user_id = auth.uid() and listing_id = p_listing;
  if found then
    return false;  -- estaba en favoritos → se quitó (unlike)
  end if;
  insert into public.favorites (user_id, listing_id) values (auth.uid(), p_listing);
  return true;     -- se agregó (like)
end;
$$;

-- ---------- REQ-08: eventos con clave de visitante para vistas únicas ----------
alter table public.listing_events add column if not exists visitor_key text;

-- Una sola vista "única" por (aviso, visitante).
create unique index if not exists listing_events_unique_view
  on public.listing_events (listing_id, visitor_key)
  where type = 'view' and visitor_key is not null;

-- Registra un evento (view | contact_click | phone_click). Para 'view',
-- solo cuenta como única la primera vez por visitante e incrementa el contador.
create or replace function public.track_event(p_listing uuid, p_type text, p_visitor text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  insert into public.listing_events (listing_id, type, visitor_key)
  values (p_listing, p_type, p_visitor)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if p_type = 'view' and v_inserted > 0 then
    update public.listings set views = views + 1 where id = p_listing;
  end if;
end;
$$;

-- ---------- REQ-08: vista agregada de estadísticas por aviso ----------
create or replace view public.listing_stats as
  select
    l.id as listing_id,
    l.owner_id,
    count(*) filter (where e.type = 'view') as unique_views,
    count(*) filter (where e.type in ('contact_click', 'phone_click')) as clicks,
    (select count(*) from public.favorites f where f.listing_id = l.id) as favorites
  from public.listings l
  left join public.listing_events e on e.listing_id = l.id
  group by l.id, l.owner_id;

grant select on public.listing_stats to authenticated;
