-- =====================================================================
-- Teléfono del anunciante en el detalle del aviso.
--
-- La RLS de profiles solo deja leer el perfil propio (profiles_select_own),
-- así que un interesado no puede leer el teléfono del vendedor por más que la
-- columna exista. Hasta ahora el front lo tenía escrito a mano como
-- "No disponible": el modal existía pero nunca hubo dato detrás.
--
-- Esta RPC es la única puerta a ese dato y aplica las reglas del lado servidor,
-- no de la interfaz:
--   * exige sesión iniciada (un anónimo nunca ve teléfonos),
--   * jamás devuelve el de un aviso confidencial (la identidad del anunciante
--     está protegida por el documento eFFe; ahí se contacta solo por chat),
--   * devuelve null si el anunciante no cargó teléfono (hoy la mitad no tiene).
-- Solo expone el teléfono, ningún otro campo del perfil.
-- =====================================================================

create or replace function public.listing_advertiser_phone(p_listing_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.phone
  from public.listings l
  join public.profiles p on p.id = l.owner_id
  where l.id = p_listing_id
    and auth.uid() is not null
    and coalesce(l.confidential, false) = false
    and nullif(trim(p.phone), '') is not null;
$$;

grant execute on function public.listing_advertiser_phone(uuid) to authenticated;
