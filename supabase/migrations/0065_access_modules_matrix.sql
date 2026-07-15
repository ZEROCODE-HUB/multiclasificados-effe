-- =====================================================================
-- 0065_access_modules_matrix.sql — "Ver sin editar" real en los módulos de acceso
--
-- Hasta aquí, Configuración comercial, Pagos y planes y Comunicaciones se
-- protegían con is_staff() (o la columna legacy profiles.role): cualquier
-- miembro del staff podía escribir, así que el toggle "editar" de Roles y
-- permisos era DECORATIVO para esos módulos. Esta migración cablea su escritura
-- a la matriz — has_perm(módulo, 'edit') — dejando intacta la LECTURA pública
-- (categorías, tarifas y paquetes se leen para navegar/comprar).
--
-- Efecto del cambio (has_perm ya es true para superadmin):
--   • superadmin y admin conservan la edición (el seed les da edit=true).
--   • moderador/soporte DEJAN de poder editar estos módulos (antes podían por el
--     hueco is_staff); el superadmin puede reactivarlo con el toggle por rol.
-- Idempotente. La lectura pública sigue en las policies *_select_* existentes.
-- =====================================================================

begin;

-- ---------- Configuración comercial → 'Configuración comercial' · edit ----------
-- Categorías (crear/editar/reordenar/eliminar).
drop policy if exists "categories_manage_staff"  on public.categories;
drop policy if exists "categories_write_matrix"   on public.categories;
create policy "categories_write_matrix" on public.categories for all
  using (public.has_perm('Configuración comercial', 'edit'))
  with check (public.has_perm('Configuración comercial', 'edit'));

-- Subcategorías (misma sección del catálogo).
drop policy if exists "subcategories_manage_staff" on public.subcategories;
drop policy if exists "subcategories_write_matrix"  on public.subcategories;
create policy "subcategories_write_matrix" on public.subcategories for all
  using (public.has_perm('Configuración comercial', 'edit'))
  with check (public.has_perm('Configuración comercial', 'edit'));

-- Nota: las VARIABLES DEL SISTEMA (set_setting / system_settings) siguen siendo
-- superadmin-only a propósito (comisión, modo mantenimiento). No se tocan aquí.

-- ---------- Pagos y planes → 'Pagos y planes' · edit ----------
-- Tarifas.
drop policy if exists "pricing_manage_staff" on public.pricing_settings;
drop policy if exists "pricing_write_matrix"  on public.pricing_settings;
create policy "pricing_write_matrix" on public.pricing_settings for all
  using (public.has_perm('Pagos y planes', 'edit'))
  with check (public.has_perm('Pagos y planes', 'edit'));

-- Promociones.
drop policy if exists "promotions_manage_staff" on public.promotions;
drop policy if exists "promotions_write_matrix"  on public.promotions;
create policy "promotions_write_matrix" on public.promotions for all
  using (public.has_perm('Pagos y planes', 'edit'))
  with check (public.has_perm('Pagos y planes', 'edit'));

-- Paquetes de saldo (migra del legacy profiles.role a la matriz).
drop policy if exists "credit_packages_write_admin"  on public.credit_packages;
drop policy if exists "credit_packages_write_matrix"  on public.credit_packages;
create policy "credit_packages_write_matrix" on public.credit_packages for all
  using (public.has_perm('Pagos y planes', 'edit'))
  with check (public.has_perm('Pagos y planes', 'edit'));

commit;

-- ---------- Comunicaciones → 'Comunicaciones' · edit ----------
-- Los envíos son RPCs security-definer: cambia el guard is_staff → has_perm.
-- El conteo de audiencia y las stats siguen con is_staff (son de lectura y la
-- pantalla ya exige 'view' vía menú/ruta). Cuerpos idénticos a 0039.

create or replace function public.admin_send_message(
  p_target text,
  p_title  text,
  p_body   text,
  p_email  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_email  text;
  v_name   text;
begin
  if not public.has_perm('Comunicaciones', 'edit') then
    raise exception 'no autorizado';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'asunto y mensaje son obligatorios';
  end if;

  -- Resolver destinatario: uuid directo, o email exacto, o nombre aproximado.
  if p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id, email, full_name into v_user, v_email, v_name
    from public.profiles where id = p_target::uuid;
  else
    select id, email, full_name into v_user, v_email, v_name
    from public.profiles
    where lower(email) = lower(btrim(p_target))
       or full_name ilike '%' || btrim(p_target) || '%'
    order by (lower(email) = lower(btrim(p_target))) desc
    limit 1;
  end if;

  if v_user is null then
    return jsonb_build_object('sent', 0, 'recipient', null);
  end if;

  insert into public.notifications (user_id, type, channel, title, payload)
  values (v_user, 'admin_message', 'in_app', p_title, jsonb_build_object('body', p_body));

  if p_email then
    insert into public.notifications (user_id, type, channel, title, payload)
    values (v_user, 'admin_message', 'email', p_title, jsonb_build_object('body', p_body));
  end if;

  perform public.log_audit('send_message', 'user', v_user::text,
    jsonb_build_object('title', p_title, 'email', p_email));

  return jsonb_build_object('sent', 1, 'recipient', coalesce(v_name, v_email));
end;
$$;

create or replace function public.admin_broadcast(
  p_audience   text,
  p_title      text,
  p_body       text,
  p_email      boolean default false,
  p_copy_staff boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if not public.has_perm('Comunicaciones', 'edit') then
    raise exception 'no autorizado';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'asunto y mensaje son obligatorios';
  end if;

  create temporary table _recipients on commit drop as
    select ca.v as id from public.comm_audience(coalesce(p_audience, 'all')) as ca(v)
    union
    select p.id from public.profiles p
    where p_copy_staff and exists (
      select 1 from public.user_roles ur
      where ur.user_id = p.id
        and ur.role::text in ('admin', 'superadmin', 'moderador', 'soporte')
    );

  select count(*) into v_count from _recipients;

  insert into public.notifications (user_id, type, channel, title, payload)
  select r.id, 'admin_message', 'in_app', p_title, jsonb_build_object('body', p_body)
  from _recipients r;

  if p_email then
    insert into public.notifications (user_id, type, channel, title, payload)
    select r.id, 'admin_message', 'email', p_title, jsonb_build_object('body', p_body)
    from _recipients r;
  end if;

  perform public.log_audit('broadcast', 'audience', p_audience,
    jsonb_build_object('title', p_title, 'recipients', v_count,
                       'email', p_email, 'copy_staff', p_copy_staff));

  return v_count;
end;
$$;

grant execute on function public.admin_send_message(text, text, text, boolean)     to authenticated;
grant execute on function public.admin_broadcast(text, text, text, boolean, boolean) to authenticated;
