-- ============================================================================
-- 0042 — Cerrar la publicación gratuita por escritura directa (Fase 1)
-- ============================================================================
-- PROBLEMA
--   `listings_insert_own` sólo comprobaba `owner_id = auth.uid()` y no
--   restringía `status`. `listings_update_own_or_staff` no declaraba WITH CHECK
--   y, cuando se omite, Postgres reutiliza la expresión de USING como check: la
--   única restricción sobre la fila nueva era que siguiera perteneciendo al
--   usuario. Por tanto cualquier usuario autenticado podía publicar gratis:
--
--     supabase.from('listings').insert({ ..., status: 'active',
--                                        expires_at: '2030-01-01' })
--     supabase.from('listings').update({ status: 'active' }).eq('id', <suyo>)
--
--   Además `publish_listing` era `security invoker`, sólo validaba propiedad y
--   no exigía que el aviso estuviera sin publicar: llamarla sobre un aviso ya
--   activo reescribía `expires_at` — una extensión de vigencia gratis.
--
-- QUÉ HACE ESTA MIGRACIÓN
--   1. El insert del dueño queda limitado a `status = 'draft'` y sin vigencia.
--   2. Un trigger BEFORE UPDATE limita al dueño a las transiciones que la app
--      realmente usa (active <-> paused, y -> sold) y congela published_at,
--      expires_at, featured y urgent.
--   3. `publish_listing` pasa a `security definer` (si no, el trigger la
--      bloquearía a ella misma) y sólo publica avisos en 'draft'/'pending'.
--
-- ALCANCE — LEER ANTES DE ASUMIR QUE "YA ESTÁ ARREGLADO"
--   Esto cierra la publicación gratuita por DML directo y la extensión gratuita
--   de vigencia. NO cierra todavía que un cliente llame a `publish_listing`
--   sin pagar: los créditos se debitan hoy con un RPC aparte (`spend_credits`)
--   desde el navegador, y atarlos exige un RPC transaccional + cliente nuevo.
--   Eso es la Fase 2. El valor de esta migración es reducir la superficie a UNA
--   sola función, que es donde la Fase 2 mete el cobro atómico.
--
--   No se toca el cliente: el APK v1.8/v1.9 ya publicado sigue funcionando
--   (inserta 'draft' y luego llama a publish_listing).
-- ============================================================================

-- ---------- 1) INSERT: el dueño sólo puede crear borradores ----------
drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own" on public.listings for insert
  with check (
    owner_id = auth.uid()
    and (
      public.is_staff(auth.uid())
      or (
        status = 'draft'
        and published_at is null
        and expires_at is null
        and featured = false
        and urgent = false
      )
    )
  );

-- WITH CHECK explícito: deja de depender del fallback USING -> WITH CHECK.
-- (Las transiciones de estado las gobierna el trigger de abajo, porque una
--  policy no puede ver la fila antigua.)
drop policy if exists "listings_update_own_or_staff" on public.listings;
create policy "listings_update_own_or_staff" on public.listings for update
  using       (owner_id = auth.uid() or public.is_staff(auth.uid()))
  with check  (owner_id = auth.uid() or public.is_staff(auth.uid()));

-- ---------- 2) Trigger de transiciones para el dueño ----------
-- Contextos exentos, y por qué:
--   * auth.uid() is null  -> cron / service_role (p. ej. `expire_listings`, que
--     corre como postgres sin JWT). Un cliente anónimo no se cuela por aquí:
--     la policy de UPDATE ya lo frena, porque `owner_id = null` es null.
--   * is_staff(auth.uid()) -> `admin_set_listing_status`, `admin_toggle_featured`.
--   * app.publishing = '1' -> la propia `publish_listing` marca la transacción.
create or replace function public.enforce_listing_owner_transitions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null
     or public.is_staff(auth.uid())
     or coalesce(current_setting('app.publishing', true), '') = '1'
  then
    return new;
  end if;

  -- A partir de aquí: el dueño escribiendo directamente desde el cliente.
  if new.status is distinct from old.status then
    if not (old.status in ('active', 'paused')
            and new.status in ('active', 'paused', 'sold')) then
      raise exception
        'Transición de estado no permitida: % -> %. Publicar un aviso requiere publish_listing.',
        old.status, new.status
        using errcode = '42501';
    end if;
  end if;

  if new.published_at is distinct from old.published_at
     or new.expires_at is distinct from old.expires_at
     or new.featured   is distinct from old.featured
     or new.urgent     is distinct from old.urgent then
    raise exception 'No puedes modificar la vigencia ni los destacados del aviso.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists listings_owner_transitions on public.listings;
create trigger listings_owner_transitions
  before update on public.listings
  for each row execute function public.enforce_listing_owner_transitions();

-- ---------- 3) publish_listing: definer + sólo desde borrador ----------
create or replace function public.publish_listing(p_listing uuid, p_duration_days int)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.listings;
begin
  if p_duration_days is null or p_duration_days <= 0 or p_duration_days > 365 then
    raise exception 'Duración inválida: % días', p_duration_days
      using errcode = '22023';
  end if;

  -- Autoriza a esta transacción a saltarse el trigger de transiciones.
  perform set_config('app.publishing', '1', true);

  -- `security definer` salta RLS, así que la comprobación de propiedad tiene
  -- que ser explícita (y lo era ya antes de esta migración).
  -- `status in ('draft','pending')` impide re-publicar un aviso activo, que
  -- reescribía expires_at gratis.
  update public.listings
  set status       = 'active',
      published_at = now(),
      expires_at   = now() + (p_duration_days || ' days')::interval
  where id = p_listing
    and status in ('draft', 'pending')
    and (owner_id = auth.uid() or public.is_staff(auth.uid()))
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Aviso no encontrado, ya publicado, o sin permiso'
      using errcode = '42501';
  end if;

  return v_row;
end;
$$;

-- `anon` no tiene nada que hacer aquí; con definer conviene ser explícito.
revoke execute on function public.publish_listing(uuid, int) from public;
grant  execute on function public.publish_listing(uuid, int) to authenticated, service_role;
