-- ============================================================================
-- Verificación manual de la migración 0042 (publicación gratuita)
-- ============================================================================
-- El repo no tiene arnés de tests SQL (pgTAP), así que esto se ejecuta a mano
-- en el SQL Editor de Supabase, PRIMERO en un proyecto de staging.
--
-- Cada bloque imprime OK o falla con una excepción. Todo corre dentro de una
-- transacción que se revierte al final: no deja basura.
--
-- Sustituye :uid por el UUID de un usuario NO staff que ya tenga perfil,
-- y :cat por un category_id existente (select id from public.categories limit 1).
-- ============================================================================

begin;

-- Simula una petición de PostgREST autenticada como ese usuario.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'uid', 'role', 'authenticated')::text,
  true
);

-- ---------------------------------------------------------------------------
-- 1) El dueño NO puede insertar un aviso ya activo.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.listings (owner_id, category_id, title, status)
    values (auth.uid(), current_setting('test.cat'), 'hack activo', 'active');
    raise exception 'FALLO: se pudo insertar un aviso con status=active';
  exception when insufficient_privilege or check_violation then
    raise notice 'OK 1 — insert directo con status=active bloqueado';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 2) El dueño SÍ puede insertar un borrador (flujo real del cliente).
-- ---------------------------------------------------------------------------
insert into public.listings (owner_id, category_id, title, status)
values (auth.uid(), current_setting('test.cat'), 'borrador de prueba', 'draft')
returning id \gset draft_

-- ---------------------------------------------------------------------------
-- 3) El dueño NO puede promover su borrador a activo por UPDATE directo.
--    (Éste era el agujero principal.)
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update public.listings set status = 'active'
    where id = current_setting('test.draft')::uuid;
    raise exception 'FALLO: se pudo activar un borrador por UPDATE directo';
  exception when insufficient_privilege then
    raise notice 'OK 3 — draft -> active por UPDATE directo bloqueado';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 4) publish_listing SÍ publica el borrador (el flujo legítimo, y el del APK viejo).
-- ---------------------------------------------------------------------------
select public.publish_listing(current_setting('test.draft')::uuid, 30);
do $$
declare s public.listing_status;
begin
  select status into s from public.listings where id = current_setting('test.draft')::uuid;
  if s <> 'active' then raise exception 'FALLO: publish_listing no activó el aviso (status=%)', s; end if;
  raise notice 'OK 4 — publish_listing activa un borrador';
end $$;

-- ---------------------------------------------------------------------------
-- 5) publish_listing NO re-publica un aviso ya activo (extensión gratis de vigencia).
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.publish_listing(current_setting('test.draft')::uuid, 365);
    raise exception 'FALLO: se pudo re-publicar un aviso ya activo';
  exception when insufficient_privilege then
    raise notice 'OK 5 — re-publicar un aviso activo bloqueado';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 6) El dueño NO puede estirar expires_at por UPDATE directo.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update public.listings set expires_at = now() + interval '10 years'
    where id = current_setting('test.draft')::uuid;
    raise exception 'FALLO: se pudo modificar expires_at';
  exception when insufficient_privilege then
    raise notice 'OK 6 — expires_at congelado para el dueño';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 7) REGRESIÓN: pausar y reanudar (togglePause) sigue funcionando.
-- ---------------------------------------------------------------------------
update public.listings set status = 'paused' where id = current_setting('test.draft')::uuid;
update public.listings set status = 'active' where id = current_setting('test.draft')::uuid;
do $$ begin raise notice 'OK 7 — active <-> paused sigue permitido'; end $$;

-- ---------------------------------------------------------------------------
-- 8) REGRESIÓN: el cron de expiración (sin JWT) sigue pudiendo expirar avisos.
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', null, true);
update public.listings
  set expires_at = now() - interval '1 day'
  where id = current_setting('test.draft')::uuid;
select public.expire_listings();
do $$
declare s public.listing_status;
begin
  select status into s from public.listings where id = current_setting('test.draft')::uuid;
  if s <> 'expired' then raise exception 'FALLO: expire_listings no expiró el aviso (status=%)', s; end if;
  raise notice 'OK 8 — expire_listings sigue funcionando';
end $$;

rollback;
