-- =====================================================================
-- 0112_reporte_de_saldos.sql — quién tiene saldo a favor, y cuánto.
--
-- Es una deuda de la plataforma con sus usuarios: dinero cobrado que todavía no
-- se ha convertido en avisos. Hasta hoy no había forma de verlo junto — el
-- historial de transacciones (0074/0075) cuenta los movimientos, no el saldo
-- vivo— así que para saber cuánto se debe en total había que sumarlo a mano.
--
-- Devuelve el nombre, el documento y el importe a favor, con buscador y
-- paginación en el servidor, y se exporta con la misma maquinaria que el resto
-- de reportes.
--
-- El guard es `has_perm('Reportes','edit')` y no 'view' a propósito: es la
-- misma sensibilidad que la pestaña de transacciones de crédito, que ya está
-- tras 'edit'. Saber cuánto dinero tiene cada usuario no es un dato de consulta
-- general.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

create or replace function public.admin_saldos_usuarios(
  p_search         text    default null,
  p_solo_con_saldo boolean default true,
  p_limit          int     default 20,
  p_offset         int     default 0
)
returns table (
  user_id uuid, full_name text, email text,
  doc_type text, doc_number text,
  balance numeric, total_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as user_id,
    p.full_name,
    p.email,
    p.doc_type::text,
    p.doc_number,
    coalesce(uc.balance, 0) as balance,
    count(*) over()::bigint as total_count
  from public.profiles p
  left join public.user_credits uc on uc.user_id = p.id
  where public.has_perm('Reportes', 'edit')
    -- Por defecto solo los que tienen dinero a favor: es lo que se está
    -- mirando. Con el interruptor salen todos, para cruzarlo con otra cosa.
    and (not p_solo_con_saldo or coalesce(uc.balance, 0) > 0)
    and (p_search is null or p_search = ''
         or p.full_name  ilike '%' || p_search || '%'
         or p.email      ilike '%' || p_search || '%'
         or p.doc_number ilike '%' || p_search || '%')
  order by coalesce(uc.balance, 0) desc, p.full_name asc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

comment on function public.admin_saldos_usuarios is
  'Reporte de saldos a favor: nombre, documento e importe pendiente por usuario. '
  'Requiere permiso de edición en Reportes.';

revoke execute on function public.admin_saldos_usuarios(text, boolean, int, int) from public;
revoke execute on function public.admin_saldos_usuarios(text, boolean, int, int) from anon;
grant  execute on function public.admin_saldos_usuarios(text, boolean, int, int) to authenticated, service_role;
