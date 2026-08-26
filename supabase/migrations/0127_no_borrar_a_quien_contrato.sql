-- =====================================================================
-- 0127_no_borrar_a_quien_contrato.sql — punto B-01 de la auditoría
--
-- Hoy `admin_delete_user` borra de `auth.users` y las FK `on delete cascade`
-- arrastran TODO: perfil, avisos, órdenes, boletas y facturas. De un cliente que
-- pagó no queda nada.
--
-- El motivo que dio el cliente es legal y es el bueno: **SUNAT o el Poder
-- Judicial pueden pedir formalmente la relación de quienes contrataron con
-- nosotros**, activos e inactivos. Eso no se reconstruye de lo borrado. Y los
-- comprobantes electrónicos hay que conservarlos aunque el cliente se vaya: la
-- boleta ya está declarada, y sigue siendo nuestra obligación.
--
-- QUÉ CAMBIA
--
-- `admin_delete_user` deja de ser un borrado a secas y decide:
--
--   · Si el usuario tiene RASTRO COMERCIAL —algún aviso, alguna orden o algún
--     comprobante— se marca `inactive`. No entra, no aparece, no recibe nada,
--     pero sigue en el maestro de clientes con su historial.
--   · Si nunca contrató nada, se borra de verdad. Guardar cuentas vacías no
--     protege de nada y solo ensucia.
--
-- Devuelve qué hizo, para que el panel pueda decirlo en lugar de dar por hecho
-- que borró.
--
-- POR QUÉ EL RASTRO SE MIDE ASÍ Y NO SOLO POR AVISOS
--
-- El punto habla de "si ya colocaron un aviso", pero alguien pudo comprar saldo
-- y no llegar a publicar: hay una boleta emitida a su nombre, declarada ante
-- SUNAT. Borrarlo dejaría un comprobante sin cliente, que es exactamente el
-- agujero que esto viene a tapar.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Estado del cliente ----------
-- `profiles.status` ya existía (text, por defecto 'active'). Solo se documenta
-- el valor nuevo y se acota lo que puede haber, para que nadie escriba
-- "inactivo", "INACTIVE" o "baja" y los filtros dejen de cuadrar en silencio.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_status_check'
  ) then
    -- Los cuatro valores salen de mirar la base, no de suponer: hoy hay
    -- `active`, `banned` y `suspended` en uso. Dejar fuera `banned` habría
    -- hecho fallar el siguiente baneo, y el síntoma —"no se puede guardar"—
    -- no habría apuntado a esta línea.
    --
    -- `not valid`: no se revisan las filas viejas. Si mañana aparece un valor
    -- histórico raro, esto fallaría y dejaría el despliegue a medias por un
    -- dato que no molesta a nadie.
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('active', 'inactive', 'suspended', 'banned')) not valid;
  end if;
end $$;

comment on column public.profiles.status is
  'active | inactive | suspended | banned. `inactive` es la baja de un cliente que YA '
  'contrató: no entra ni aparece, pero se conserva en el maestro de clientes '
  'porque SUNAT o el Poder Judicial pueden pedir esa relación (B-01).';

-- ---------- 2. ¿Contrató algo alguna vez? ----------
create or replace function public.tiene_rastro_comercial(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.listings where owner_id = p_user)
      or exists (select 1 from public.orders   where user_id  = p_user)
      or exists (select 1 from public.invoices i
                  join public.orders o on o.id = i.order_id
                 where o.user_id = p_user);
$$;

revoke execute on function public.tiene_rastro_comercial(uuid) from public;
grant  execute on function public.tiene_rastro_comercial(uuid) to authenticated, service_role;

comment on function public.tiene_rastro_comercial(uuid) is
  'true si el usuario tiene avisos, órdenes o comprobantes. Decide si su cuenta '
  'se puede borrar de verdad o solo desactivar (B-01).';

-- ---------- 3. Borrar deja de borrar a quien contrató ----------
-- DROP explícito: la función existía como `returns void` y Postgres no deja
-- cambiar el tipo de retorno con `create or replace`. El DROP se lleva por
-- delante los permisos —de ahí el `grant` de más abajo, que no es decorativo:
-- sin él, por la migración 0104, el panel daría 42501 en silencio.
drop function if exists public.admin_delete_user(uuid);

create or replace function public.admin_delete_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rastro boolean;
begin
  if not public.has_role(auth.uid(), 'superadmin') then
    raise exception 'solo el superadmin puede eliminar usuarios';
  end if;
  if p_user = auth.uid() then
    raise exception 'no puedes eliminar tu propia cuenta';
  end if;

  v_rastro := public.tiene_rastro_comercial(p_user);

  if v_rastro then
    -- Baja, no borrado. Se le corta el acceso y deja de estar visible, pero su
    -- ficha y su historial siguen ahí.
    update public.profiles
       set status = 'inactive',
           updated_at = now()
     where id = p_user;

    -- Sus avisos dejan de mostrarse: un cliente dado de baja no puede seguir
    -- teniendo avisos vivos que nadie va a atender.
    update public.listings
       set status = 'paused'
     where owner_id = p_user and status = 'active';

    perform public.log_audit('deactivate_user', 'user', p_user::text,
      jsonb_build_object('motivo', 'tiene historial comercial'));

    return jsonb_build_object('ok', true, 'accion', 'desactivado');
  end if;

  -- Sin rastro comercial: se borra de verdad. Guardar cuentas vacías no protege
  -- de nada.
  perform public.log_audit('delete_user', 'user', p_user::text, '{}'::jsonb);
  update public.pricing_settings set updated_by = null where updated_by = p_user;
  delete from auth.users where id = p_user;

  return jsonb_build_object('ok', true, 'accion', 'eliminado');
end;
$$;

-- La firma cambió (void → jsonb), así que el DROP implícito de `create or
-- replace` no basta y hay que volver a conceder EXECUTE: por la migración 0104
-- una función nace SIN permisos, y sin esto el panel daría 42501 en silencio.
revoke execute on function public.admin_delete_user(uuid) from public;
grant  execute on function public.admin_delete_user(uuid) to authenticated;

comment on function public.admin_delete_user(uuid) is
  'Da de baja o elimina un usuario según tenga historial comercial. Devuelve '
  '{accion: desactivado|eliminado}. B-01: a quien ya contrató NO se le borra, '
  'porque SUNAT o el Poder Judicial pueden pedir esa relación.';

-- ---------- 4. Reactivar ----------
-- Sin esto una baja sería irreversible, y la primera vez que se desactive a
-- alguien por error habría que ir a la base de datos.
create or replace function public.admin_reactivar_usuario(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_perm('Gestión de usuarios', 'edit') then
    raise exception 'no autorizado';
  end if;
  update public.profiles set status = 'active', updated_at = now() where id = p_user;
  perform public.log_audit('reactivate_user', 'user', p_user::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.admin_reactivar_usuario(uuid) from public;
grant  execute on function public.admin_reactivar_usuario(uuid) to authenticated;

comment on function public.admin_reactivar_usuario(uuid) is
  'Devuelve a activo un cliente dado de baja. Sus avisos NO se reactivan solos: '
  'los pausados se vuelven a publicar uno a uno, que es lo que el dueño espera.';

-- ---------- 5. Filtrar por estado en Gestión de Usuarios ----------
-- El punto B-01 lo pide explícitamente: "que al momento de emitir reportes se
-- permita en los filtros colocar esa opción de Activos/Inactivos". Sin esto la
-- baja existiría pero no se podría consultar, que es justo lo que van a pedir.
--
-- El parámetro va al FINAL y con default: así las llamadas que ya existen
-- siguen funcionando sin tocarlas.
create or replace function public.admin_list_users(
  p_search text default null,
  p_role   text default null,
  p_limit  int  default 100,
  p_offset int  default 0,
  p_status text default null
) returns table (
  id uuid, full_name text, email text, status text, verified boolean,
  roles text, listings_count bigint, suspended_until timestamptz,
  rating numeric, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select
    p.id, p.full_name, p.email, p.status, p.verified,
    coalesce((select string_agg(r.role::text, ',' order by r.role::text)
              from public.user_roles r where r.user_id = p.id), 'buscador') as roles,
    (select count(*) from public.listings l where l.owner_id = p.id) as listings_count,
    p.suspended_until, p.rating, p.created_at
  from public.profiles p
  where public.is_staff(auth.uid())
    and (p_search is null or p_search = ''
         or p.full_name ilike '%' || p_search || '%'
         or p.email     ilike '%' || p_search || '%')
    and (p_role is null or p_role = '' or exists (
         select 1 from public.user_roles r where r.user_id = p.id and r.role::text = p_role))
    -- `coalesce` porque `status` admite null en filas antiguas: sin él, filtrar
    -- por "activos" las dejaría fuera aunque lo estén.
    and (p_status is null or p_status = '' or coalesce(p.status, 'active') = p_status)
  order by p.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

revoke execute on function public.admin_list_users(text, text, int, int, text) from public;
grant  execute on function public.admin_list_users(text, text, int, int, text) to authenticated;
