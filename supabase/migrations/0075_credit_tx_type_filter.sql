-- =====================================================================
-- EFFE-054 (mejora) — filtrar el historial de transacciones por TIPO
-- (compra / gasto). Se agrega el parámetro p_type a admin_credit_transactions.
-- Cambia la firma → drop de la versión anterior (5 args) + create (6 args).
-- =====================================================================

drop function if exists public.admin_credit_transactions(text, timestamptz, timestamptz, int, int);

create or replace function public.admin_credit_transactions(
  p_search text        default null,
  p_type   text        default null,   -- 'purchase' | 'spend' | null (todas)
  p_from   timestamptz default null,
  p_to     timestamptz default null,
  p_limit  int         default 20,
  p_offset int         default 0
)
returns table (
  id uuid, user_id uuid, full_name text, email text,
  type text, credits numeric, description text,
  listing_title text, created_at timestamptz, total_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    ct.id, ct.user_id, p.full_name, p.email,
    ct.type, ct.credits, ct.description,
    l.title as listing_title, ct.created_at,
    count(*) over()::bigint as total_count
  from public.credit_transactions ct
  join public.profiles p on p.id = ct.user_id
  left join public.listings l on l.id = ct.listing_id
  where public.has_perm('Reportes', 'edit')
    and (p_type is null or p_type = '' or ct.type = p_type)
    and (p_search is null or p_search = ''
         or p.full_name   ilike '%' || p_search || '%'
         or p.email       ilike '%' || p_search || '%'
         or ct.description ilike '%' || p_search || '%')
    and (p_from is null or ct.created_at >= p_from)
    and (p_to is null or ct.created_at < (p_to + interval '1 day'))
  order by ct.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke execute on function public.admin_credit_transactions(text, text, timestamptz, timestamptz, int, int) from public, anon;
grant  execute on function public.admin_credit_transactions(text, text, timestamptz, timestamptz, int, int) to authenticated;
