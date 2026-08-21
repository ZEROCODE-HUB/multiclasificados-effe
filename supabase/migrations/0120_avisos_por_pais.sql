-- =====================================================================
-- 0120_avisos_por_pais.sql — cuántos avisos hay en cada país.
--
-- El filtro de búsqueda pasa de 26 países elegidos a mano a los 249 de la ISO,
-- y con esa lista hace falta decir dónde hay algo: "Perú 216, Rumanía 3" ahorra
-- elegir un país para descubrir que está vacío.
--
-- Se cuenta sobre `listing_cards` A PROPÓSITO, y no sobre `listings`: es la
-- misma vista de la que sale `search_listings`, así que el número que se enseña
-- es exactamente el que devolverá el buscador al filtrar. Contarlo de otra
-- forma daría "5" donde luego aparecen 3, y un contador que miente es peor que
-- no tener ninguno (la vista ya filtra `status = 'active'` y exige perfil).
--
-- De paso se arregla el aviso de Bucarest que quedó como "Otro país" (XX).
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================
begin;

create or replace function public.avisos_activos_por_pais()
returns table (country text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select lc.country, count(*)::bigint
    from public.listing_cards lc
   group by lc.country;
$$;

comment on function public.avisos_activos_por_pais is
  'Avisos activos por país (ISO alpha-2), contados sobre la misma vista que usa '
  'search_listings para que el número coincida con lo que devuelve el filtro.';

-- Por la 0104 una función nace SIN execute para anon/authenticated. El buscador
-- es público —se usa sin sesión—, así que sin este grant el contador vendría
-- vacío en producción con un 42501 que el cliente se traga en silencio.
revoke execute on function public.avisos_activos_por_pais() from public;
grant execute on function public.avisos_activos_por_pais() to anon, authenticated;

-- ---------- Los avisos de Bucarest ----------
-- Tres avisos del mismo sitio quedaron clasificados de dos maneras: dos con el
-- 'RO' que devuelve el geocoder de Google y uno con el 'XX' de "Otro país", que
-- ya no existe en el selector. Se unifican.
--
-- Acotado a Bucarest a propósito: si mañana aparece otro 'XX' de otro sitio,
-- que no se lo lleve por delante esta migración.
update public.listings
   set country = 'RO'
 where country = 'XX'
   and location ilike '%bucarest%';

commit;
