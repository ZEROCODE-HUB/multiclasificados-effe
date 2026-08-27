-- =====================================================================
-- 0131_saber_que_pasa_al_dar_de_baja.sql
--
-- EL PROBLEMA: el botón de la papelera hace DOS COSAS MUY DISTINTAS y no se
-- sabe cuál hasta después de pulsarlo.
--
-- `admin_delete_user` mira si la persona tiene rastro comercial —algún aviso,
-- algún pedido o alguna boleta—. Si lo tiene, la da de baja y conserva su
-- historial; si no, la BORRA de forma permanente. La regla es buena: a quien te
-- compró algo no puedes borrarlo, porque sus boletas están declaradas y pueden
-- pedirte la relación de quién contrató. Guardar cuentas vacías, en cambio, no
-- protege de nada.
--
-- Lo que está mal es que quien pulsa no ve ese dato. El diálogo lo explica en un
-- párrafo, y para una acción irreversible eso es poco: hay que decirle qué va a
-- pasar CON ESE USUARIO, no cómo funciona la regla en general.
--
-- Por eso la lista pasa a traer `tiene_rastro`, y el panel puede avisar de si
-- va a dar de baja o a borrar antes de que nadie confirme nada.
--
-- DE PASO SE LIMPIA UNA SOBRECARGA. La 0127 añadió `p_status` creando una
-- función de 5 argumentos, pero la de 4 se quedó viva: dos versiones de lo
-- mismo conviviendo, y PostgREST eligiendo por la forma de la llamada. Se retira
-- la vieja.
--
-- Idempotente.
-- =====================================================================

-- ---------- Fuera la sobrecarga antigua ----------
drop function if exists public.admin_list_users(text, text, integer, integer);

-- ---------- La lista dice si hay rastro comercial ----------
-- Cambia el tipo de retorno, así que hay que DROP + CREATE. Ojo: eso PIERDE los
-- permisos, y por la 0104 una función nueva nace sin EXECUTE. Se vuelven a dar
-- abajo; sin ellos, 42501 en producción y la lista de usuarios vacía.
drop function if exists public.admin_list_users(text, text, integer, integer, text);

create function public.admin_list_users(
  p_search text default null,
  p_role   text default null,
  p_limit  integer default 100,
  p_offset integer default 0,
  p_status text default null
)
returns table (
  id uuid,
  full_name text,
  email text,
  status text,
  verified boolean,
  roles text,
  listings_count bigint,
  suspended_until timestamptz,
  rating numeric,
  created_at timestamptz,
  tiene_rastro boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.full_name, p.email, p.status, p.verified,
    coalesce((select string_agg(r.role::text, ',' order by r.role::text)
              from public.user_roles r where r.user_id = p.id), 'buscador') as roles,
    (select count(*) from public.listings l where l.owner_id = p.id) as listings_count,
    p.suspended_until, p.rating, p.created_at,
    -- La MISMA función que decide en admin_delete_user. Si el panel calculara
    -- el rastro por su cuenta acabaría avisando de una cosa y ocurriendo otra,
    -- que es peor que no avisar.
    public.tiene_rastro_comercial(p.id) as tiene_rastro
  from public.profiles p
  where public.is_staff(auth.uid())
    and (p_search is null or p_search = ''
         or p.full_name ilike '%' || p_search || '%'
         or p.email     ilike '%' || p_search || '%')
    and (p_role is null or p_role = '' or exists (
         select 1 from public.user_roles r where r.user_id = p.id and r.role::text = p_role))
    and (p_status is null or p_status = '' or coalesce(p.status, 'active') = p_status)
  order by p.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke execute on function public.admin_list_users(text, text, integer, integer, text) from public;
grant  execute on function public.admin_list_users(text, text, integer, integer, text) to authenticated;

comment on function public.admin_list_users(text, text, integer, integer, text) is
  'Lista de usuarios para el panel. `tiene_rastro` dice si esa persona tiene '
  'avisos, pedidos o boletas: es lo que decide si la papelera la da de baja o '
  'la borra, y el panel lo avisa ANTES de confirmar.';
