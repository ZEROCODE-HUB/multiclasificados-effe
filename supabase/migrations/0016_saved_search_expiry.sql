-- =====================================================================
-- 0016_saved_search_expiry.sql — REQ-04 (alertas de búsquedas guardadas)
-- + REQ-01 (vigencia/expiración de avisos) + publicación (idempotente)
-- =====================================================================

-- ---------- REQ-04: estado de ejecución de alertas ----------
alter table public.saved_searches add column if not exists last_run_at timestamptz;
alter table public.saved_searches add column if not exists last_notified_at timestamptz;

-- Recorre las búsquedas guardadas con alerta activa, cuenta avisos nuevos
-- que coincidan desde la última corrida y genera notificaciones.
create or replace function public.run_saved_search_alerts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int;
  v_total int := 0;
begin
  for r in select * from public.saved_searches where alert_enabled loop
    select count(*) into v_count
    from public.search_listings(
      nullif(r.criteria->>'q', ''),
      nullif(r.criteria->>'category', ''),
      nullif(r.criteria->>'subcategory', '')::uuid,
      nullif(r.criteria->>'priceMin', '')::numeric,
      nullif(r.criteria->>'priceMax', '')::numeric,
      nullif(r.criteria->>'currency', '')::public.currency,
      nullif(r.criteria->>'lat', '')::numeric,
      nullif(r.criteria->>'lng', '')::numeric,
      nullif(r.criteria->>'radiusKm', '')::numeric,
      'recent', 100, 0
    ) sl
    where sl.published_at > coalesce(r.last_run_at, r.created_at);

    if v_count > 0 then
      perform public.notify_user(
        r.user_id, 'saved_search_match', 'Nuevos avisos para tu búsqueda',
        jsonb_build_object('saved_search_id', r.id, 'count', v_count, 'name', r.name)
      );
      update public.saved_searches set last_notified_at = now() where id = r.id;
      v_total := v_total + 1;
    end if;

    update public.saved_searches set last_run_at = now() where id = r.id;
  end loop;
  return v_total;
end;
$$;

-- ---------- REQ-01: expiración automática por vigencia ----------
create or replace function public.expire_listings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.listings
  set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------- REQ-01: publicar un aviso (estado + vigencia) ----------
-- Pone el aviso en 'active', fija published_at y expires_at = ahora + duración.
create or replace function public.publish_listing(p_listing uuid, p_duration_days int)
returns public.listings
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.listings;
begin
  update public.listings
  set status = 'active',
      published_at = now(),
      expires_at = now() + (p_duration_days || ' days')::interval
  where id = p_listing
    and (owner_id = auth.uid() or public.is_staff(auth.uid()))
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Aviso no encontrado o sin permiso';
  end if;
  return v_row;
end;
$$;
