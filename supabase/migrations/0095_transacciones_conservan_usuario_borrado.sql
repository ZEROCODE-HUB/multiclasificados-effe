-- =====================================================================
-- 0095_transacciones_conservan_usuario_borrado.sql
--
-- El historial de transacciones de crédito (Reportes → Transacciones) unía con
-- `profiles` con un INNER JOIN. Consecuencia: al borrar un usuario, TODOS sus
-- movimientos de saldo desaparecían del historial y del total — en un registro
-- financiero, justo lo que no debe pasar: el movimiento existió, el dinero se
-- cobró y la boleta se emitió, aunque la cuenta ya no esté.
--
-- Ahora la unión es LEFT y, si el perfil ya no existe, se cae a `auth.users`
-- (la RPC es security definer, así que puede leerla). Solo cuando tampoco
-- queda rastro allí, la fila viaja con el nombre en NULL y el front la muestra
-- como "Usuario eliminado" junto al inicio de su id, que es lo único que
-- permite seguir identificando a quién correspondía.
--
-- La búsqueda también acepta ahora el id del usuario, para poder rastrear
-- justamente esos movimientos huérfanos.
--
-- Misma firma y mismo tipo de retorno → CREATE OR REPLACE. Idempotente.
-- =====================================================================

create or replace function public.admin_credit_transactions(
  p_search text default null,
  p_type   text default null,
  p_from   timestamptz default null,
  p_to     timestamptz default null,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table(
  id uuid, user_id uuid, full_name text, email text, type text,
  credits numeric, description text, listing_title text,
  created_at timestamptz, total_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    ct.id,
    ct.user_id,
    -- Perfil → metadatos de auth → NULL (el front lo pinta como eliminado).
    coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name') as full_name,
    coalesce(p.email, u.email)                                  as email,
    ct.type, ct.credits, ct.description,
    l.title as listing_title, ct.created_at,
    count(*) over()::bigint as total_count
  from public.credit_transactions ct
  left join public.profiles p on p.id = ct.user_id
  left join auth.users     u on u.id = ct.user_id
  left join public.listings l on l.id = ct.listing_id
  where public.has_perm('Reportes', 'edit')
    and (p_type is null or p_type = '' or ct.type = p_type)
    and (p_search is null or p_search = ''
         or coalesce(p.full_name, u.raw_user_meta_data ->> 'full_name', '') ilike '%' || p_search || '%'
         or coalesce(p.email, u.email, '')                                  ilike '%' || p_search || '%'
         or coalesce(ct.description, '')                                    ilike '%' || p_search || '%'
         -- Permite rastrear los movimientos de una cuenta ya borrada.
         or ct.user_id::text ilike '%' || p_search || '%')
    and (p_from is null or ct.created_at >= p_from)
    and (p_to   is null or ct.created_at < (p_to + interval '1 day'))
  order by ct.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

grant execute on function public.admin_credit_transactions(text, text, timestamptz, timestamptz, integer, integer) to authenticated;
