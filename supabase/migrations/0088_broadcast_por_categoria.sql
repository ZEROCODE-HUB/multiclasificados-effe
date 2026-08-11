-- =====================================================================
-- 0088_broadcast_por_categoria.sql — el envío masivo puede dirigirse a quienes
-- publicaron en ciertas categorías.
--
-- Hasta ahora el masivo iba SIEMPRE a todo el mundo. Se añaden dos filtros que
-- se combinan:
--
--   · p_categories   códigos de categoría. Vacío o nulo = todos los usuarios,
--                    que es exactamente el comportamiento anterior.
--   · p_only_active  false = cualquiera que haya publicado ahí alguna vez;
--                    true  = solo quien tiene un aviso VIGENTE en esa categoría.
--
-- Qué es "vigente": estado 'active' Y sin fecha de vencimiento pasada. Las dos
-- condiciones, no una: `expire_listings()` es una función que alguien tiene que
-- ejecutar, así que un aviso puede seguir marcado como 'active' con la fecha ya
-- pasada. Mirar solo el estado metería en la audiencia a anunciantes cuyo aviso
-- lleva semanas caído.
--
-- La pieza central es `comm_destinatarios`, que arma el conjunto EXACTO de
-- destinatarios —copia al equipo interno incluida— y de la que tiran tanto el
-- contador de la interfaz como el envío. Antes eran dos caminos distintos y el
-- contador se apañaba con un truco ('all' == usuarios ∪ staff) que solo valía
-- mientras no hubiera filtros. Con una sola función no pueden discrepar: lo que
-- dice el botón "Enviar a N" es lo que se envía.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- El conjunto de destinatarios, en un solo sitio ----------
create or replace function public.comm_destinatarios(
  p_audience   text,
  p_categories text[] default null,
  p_only_active boolean default false,
  p_copy_staff boolean default false
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- La audiencia base, acotada por categoría si se pidió.
  select ca.v
  from public.comm_audience(coalesce(p_audience, 'all')) as ca(v)
  where p_categories is null
     or cardinality(p_categories) = 0
     or exists (
       select 1
       from public.listings l
       where l.owner_id = ca.v
         and l.category_id = any(p_categories)
         and (
           not p_only_active
           or (l.status = 'active' and (l.expires_at is null or l.expires_at > now()))
         )
     )
  union
  -- El equipo interno, si se pidió copia. Va aparte del filtro de categoría a
  -- propósito: la copia es para que el staff vea lo que se mandó, no depende de
  -- que hayan publicado nada.
  select p.id
  from public.profiles p
  where p_copy_staff and exists (
    select 1 from public.user_roles ur
    where ur.user_id = p.id
      and ur.role::text in ('admin', 'superadmin', 'moderador', 'soporte')
  );
$$;

comment on function public.comm_destinatarios is
  'Destinatarios exactos de un envío masivo. La usan por igual el contador de '
  'la interfaz y admin_broadcast, para que no puedan dar números distintos.';

-- No es para el cliente: se llama desde las funciones de abajo, que son las que
-- comprueban permisos. Mismo criterio que comm_audience.
revoke execute on function public.comm_destinatarios(text, text[], boolean, boolean)
  from public, anon, authenticated;

-- ---------- Contador ----------
-- Se retira la firma anterior: dejarla haría ambigua cualquier llamada con
-- parámetros por defecto y Postgres la rechazaría.
drop function if exists public.admin_audience_count(text);

create or replace function public.admin_audience_count(
  p_audience    text,
  p_categories  text[] default null,
  p_only_active boolean default false,
  p_copy_staff  boolean default false
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  select count(*) into v_count
    from public.comm_destinatarios(
      coalesce(p_audience, 'all'), p_categories, coalesce(p_only_active, false),
      coalesce(p_copy_staff, false));
  return coalesce(v_count, 0);
end;
$$;

-- ---------- Envío ----------
drop function if exists public.admin_broadcast(text, text, text, boolean, boolean);

create or replace function public.admin_broadcast(
  p_audience    text,
  p_title       text,
  p_body        text,
  p_email       boolean default false,
  p_copy_staff  boolean default false,
  p_categories  text[] default null,
  p_only_active boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.has_perm('Comunicaciones', 'edit') then
    raise exception 'no autorizado';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'asunto y mensaje son obligatorios';
  end if;

  create temporary table _recipients on commit drop as
    select d.v as id
    from public.comm_destinatarios(
      coalesce(p_audience, 'all'), p_categories, coalesce(p_only_active, false),
      coalesce(p_copy_staff, false)) as d(v);

  select count(*) into v_count from _recipients;

  insert into public.notifications (user_id, type, channel, title, payload)
  select r.id, 'admin_message', 'in_app', p_title, jsonb_build_object('body', p_body)
  from _recipients r;

  if p_email then
    insert into public.notifications (user_id, type, channel, title, payload)
    select r.id, 'admin_message', 'email', p_title, jsonb_build_object('body', p_body)
    from _recipients r;
  end if;

  -- El filtro queda en la auditoría: con envíos segmentados, "a cuántos" ya no
  -- basta para saber a quiénes se les mandó.
  perform public.log_audit('broadcast', 'audience', p_audience,
    jsonb_build_object('title', p_title, 'recipients', v_count,
                       'email', p_email, 'copy_staff', p_copy_staff,
                       'categories', to_jsonb(coalesce(p_categories, array[]::text[])),
                       'only_active', coalesce(p_only_active, false)));

  return v_count;
end;
$$;

grant execute on function public.admin_audience_count(text, text[], boolean, boolean) to authenticated;
grant execute on function public.admin_broadcast(text, text, text, boolean, boolean, text[], boolean) to authenticated;
