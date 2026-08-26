-- =====================================================================
-- 0123_transacciones_con_modo_de_pago.sql
--
-- El Reporte de Transacciones dice cuánto entró y cuándo, pero no POR DÓNDE.
-- Con tres vías de cobro conviviendo —tarjeta, Yape y QR/Plin— eso obliga a
-- cruzar a mano con la bandeja de pagos manuales para cuadrar cualquier día.
-- Pedido por el cliente en la auditoría de agosto (anexo B, punto 05).
--
-- El dato ya existe: cada orden guarda su `payment_provider`, y desde la 0117
-- ya no se fuerza a 'izipay' cuando el pago fue por billetera. Aquí solo se
-- trae hasta el reporte, uniendo por `credit_transactions.order_id`.
--
-- QUÉ SIGNIFICA CADA VALOR, que es lo que decide cómo se pinta:
--   izipay              → pagó con tarjeta por la pasarela
--   yape / plin         → transfirió y alguien lo aprobó a mano
--   creditos            → un administrador le otorgó saldo (no entró dinero)
--   backfill / simulado → datos migrados o de pruebas, sin cobro real
--   NULL                → o es un GASTO (publicar, que no tiene forma de pago
--                         porque se paga con el saldo ya cargado), o es una
--                         compra antigua de antes de que se guardara.
--
-- La distinción del NULL importa: enseñar "—" en un gasto es correcto, pero
-- enseñarlo en una compra es un agujero en el reporte. Por eso el front los
-- pinta distinto y no colapsa los dos casos.
--
-- Cambia el TIPO DE RETORNO, así que no vale `create or replace`: hay que
-- soltarla y volver a crearla. Se hace en una transacción y el hueco es de
-- milisegundos; si alguien pide el reporte justo ahí, recarga y ya está.
-- =====================================================================

drop function if exists public.admin_credit_transactions(text, text, timestamptz, timestamptz, integer, integer);

create function public.admin_credit_transactions(
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
  payment_provider text,
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
    l.title as listing_title,
    o.payment_provider,
    ct.created_at,
    count(*) over()::bigint as total_count
  from public.credit_transactions ct
  left join public.profiles p on p.id = ct.user_id
  left join auth.users     u on u.id = ct.user_id
  left join public.listings l on l.id = ct.listing_id
  -- LEFT y no INNER: un gasto no tiene orden, y con INNER desaparecerían del
  -- historial justo los movimientos que explican en qué se fue el saldo.
  left join public.orders   o on o.id = ct.order_id
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

-- Por la 0104 una función nace SIN execute, y al soltarla se perdió el grant
-- que tenía. Sin esta línea el reporte se queda vacío en producción sin decir
-- por qué: el cliente se traga el 42501 y el administrador ve "no hay
-- transacciones", que es la peor forma de fallar.
revoke execute on function public.admin_credit_transactions(text, text, timestamptz, timestamptz, integer, integer) from public, anon;
grant  execute on function public.admin_credit_transactions(text, text, timestamptz, timestamptz, integer, integer) to authenticated;
