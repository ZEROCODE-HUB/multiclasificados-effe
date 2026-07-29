-- =====================================================================
-- 0078_advertiser_public_stats.sql — Ficha pública del anunciante
--
-- La tarjeta "Publicado por" del detalle del aviso mostraba "0 avisos" y
-- "Nuevo" SIEMPRE: eran literales escritos en el JSX, no datos (IT3-013).
--
-- El conteo de avisos activos se podría hacer desde el cliente, pero la fecha
-- de alta del anunciante NO: `profiles` solo es legible por su dueño o por el
-- staff, y ampliar esa política expondría teléfono, documento y correo de todo
-- el mundo. Esta función devuelve únicamente los dos datos que la ficha enseña,
-- en una sola llamada.
--
-- Idempotente.
-- =====================================================================

begin;

create or replace function public.advertiser_public_stats(p_owner uuid)
returns table (active_listings integer, member_since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int
       from public.listings l
      where l.owner_id = p_owner
        and l.status = 'active')                       as active_listings,
    (select p.created_at from public.profiles p where p.id = p_owner) as member_since;
$$;

comment on function public.advertiser_public_stats(uuid) is
  'Datos públicos de la ficha "Publicado por": avisos activos y fecha de alta. No expone ningún otro campo de profiles.';

grant execute on function public.advertiser_public_stats(uuid) to anon, authenticated;

commit;
