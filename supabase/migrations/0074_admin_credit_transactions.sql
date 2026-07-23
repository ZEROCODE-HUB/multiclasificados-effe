-- =====================================================================
-- EFFE-054 — Historial de transacciones de crédito (panel admin).
-- EFFE-057/058 — Eliminar funciones muertas que nunca se cablearon.
--
-- admin_credit_transactions: lista TODAS las transacciones de crédito (compra /
-- gasto) unidas al perfil (nombre/correo) y al aviso relacionado, con búsqueda
-- por usuario, filtro de fechas y paginación. Gated por has_perm('Reportes',
-- 'edit') — un permiso NUEVO y separado del "ver reportes", porque son datos
-- financieros: el superadmin siempre pasa; el resto solo si el superadmin les
-- concede ese toggle en Roles y permisos. `count(*) over()` da el total para
-- paginar. SECURITY DEFINER (salta RLS para leer entre usuarios).
-- =====================================================================

create or replace function public.admin_credit_transactions(
  p_search text        default null,
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
    and (p_search is null or p_search = ''
         or p.full_name   ilike '%' || p_search || '%'
         or p.email       ilike '%' || p_search || '%'
         or ct.description ilike '%' || p_search || '%')
    and (p_from is null or ct.created_at >= p_from)
    -- p_to es la fecha "hasta" (día completo): se incluye todo ese día.
    and (p_to is null or ct.created_at < (p_to + interval '1 day'))
  order by ct.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke execute on function public.admin_credit_transactions(text, timestamptz, timestamptz, int, int) from public, anon;
grant  execute on function public.admin_credit_transactions(text, timestamptz, timestamptz, int, int) to authenticated;

-- ---------- Funciones muertas (definidas pero sin UI, nunca pedidas) ----------
-- admin_toggle_featured: marcar "Destacado" desde el admin (nunca hubo botón).
-- admin_user_activity: historial de acciones de UN usuario (nunca hubo pantalla).
drop function if exists public.admin_toggle_featured(uuid, boolean);
drop function if exists public.admin_user_activity(uuid);
