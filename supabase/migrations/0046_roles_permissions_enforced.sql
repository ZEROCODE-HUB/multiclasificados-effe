-- =====================================================================
-- 0046_roles_permissions_enforced.sql — Moderador y Soporte existen de verdad,
-- y la Matriz de permisos deja de ser decorativa.
--
-- DOS PROBLEMAS
--
-- 1) `is_staff()` era `admin or superadmin`. Moderador y Soporte no podían
--    entrar al panel: la pantalla "Roles y permisos" configuraba dos roles que
--    rebotaban en la puerta.
--
-- 2) La matriz (`role_permissions`) solo la leía el navegador, vía
--    `usePermissions`. Ningún RPC la consultaba: desmarcar "Editar" a Soporte
--    escondía el botón, pero `admin_set_user_status` seguía aceptando la
--    llamada. Las casillas no eran permisos, eran una sugerencia.
--
-- QUÉ HACE
--   1. `is_staff()` incluye moderador y soporte.
--   2. `has_perm(módulo, acción)`: el superadmin siempre puede (define la
--      matriz, no está sujeto a ella); el resto, lo que diga su fila.
--      Sin fila -> NO puede. Por eso el paso 3 siembra las filas ANTES.
--   3. Defaults para admin/moderador/soporte en los 8 módulos, sin pisar lo ya
--      configurado (`on conflict do nothing`).
--   4. Los RPCs de avisos, usuarios y denuncias exigen el permiso concreto.
--
-- ALCANCE
--   Comunicaciones, Pagos y planes y Auditoría siguen con `is_staff()` a secas.
--   Sus pantallas ya son de superadmin o no tienen RPC de escritura propio.
--   `admin_delete_user` y `set_setting` siguen exigiendo superadmin: la matriz
--   no puede conceder lo que esas funciones nunca dieron.
-- =====================================================================

begin;

-- ---------- 1) Moderador y Soporte son personal de la plataforma ----------
create or replace function public.is_staff(_uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.has_role(_uid, 'admin')
      or public.has_role(_uid, 'superadmin')
      or public.has_role(_uid, 'moderador')
      or public.has_role(_uid, 'soporte');
$$;

-- ---------- 2) La matriz, consultable desde el servidor ----------
-- `bool_or`: si el usuario acumula varios roles, gana el más permisivo, igual
-- que hace `get_my_permissions` para pintar el panel.
create or replace function public.has_perm(p_module text, p_action text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_ok boolean;
begin
  if public.has_role(auth.uid(), 'superadmin') then
    return true;
  end if;
  if p_action not in ('view', 'edit', 'approve', 'delete') then
    raise exception 'acción inválida: %', p_action;
  end if;

  select bool_or(
           case p_action
             when 'view'    then rp.can_view
             when 'edit'    then rp.can_edit
             when 'approve' then rp.can_approve
             when 'delete'  then rp.can_delete
           end)
    into v_ok
  from public.role_permissions rp
  join public.user_roles ur on ur.role::text = rp.role
  where ur.user_id = auth.uid()
    and rp.module = p_module;

  -- Sin fila para ese (rol, módulo) no hay permiso. Las filas se siembran abajo.
  return coalesce(v_ok, false);
end;
$$;

grant execute on function public.has_perm(text, text) to authenticated;

-- ---------- 3) Defaults por rol ----------
-- Moderador modera: escribe en avisos, usuarios y denuncias; en lo demás mira.
-- Soporte acompaña: solo mira. Admin opera todo salvo borrar.
-- `on conflict do nothing` respeta lo que el superadmin ya haya guardado.
insert into public.role_permissions (role, module, can_view, can_edit, can_approve, can_delete)
select
  r.role,
  m.module,
  true                                                     as can_view,
  case r.role
    when 'admin'     then true
    when 'moderador' then m.module in ('Gestión de avisos', 'Gestión de usuarios', 'Conversaciones reportadas')
    else false
  end                                                      as can_edit,
  case r.role
    when 'admin'     then true
    when 'moderador' then m.module in ('Gestión de avisos', 'Conversaciones reportadas')
    else false
  end                                                      as can_approve,
  false                                                    as can_delete
from (values ('admin'), ('moderador'), ('soporte')) as r(role)
cross join (values
  ('Gestión de avisos'), ('Gestión de usuarios'), ('Pagos y planes'),
  ('Configuración comercial'), ('Comunicaciones'), ('Conversaciones reportadas'),
  ('Reportes'), ('Auditoría y logs')
) as m(module)
on conflict (role, module) do nothing;

-- ---------- 4) Los RPCs exigen el permiso ----------
-- Gestión de avisos ---------------------------------------------------------
create or replace function public.admin_set_listing_status(p_listing uuid, p_status public.listing_status)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('Gestión de avisos', 'edit') then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  update public.listings set status = p_status where id = p_listing;
  perform public.log_audit('set_listing_status', 'listing', p_listing::text,
                           jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_toggle_featured(p_listing uuid, p_featured boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('Gestión de avisos', 'edit') then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  update public.listings set featured = p_featured where id = p_listing;
  perform public.log_audit('toggle_featured', 'listing', p_listing::text,
                           jsonb_build_object('featured', p_featured));
end;
$$;

-- El aviso denunciado (0044): verlo es "ver" el módulo de avisos.
create or replace function public.admin_get_listing(p_id uuid)
returns table (
  id uuid, title text, description text, price numeric, currency text,
  condition text, category_id text, subcategory_id text, location text,
  status text, featured boolean, urgent boolean, views int,
  rejection_reason text, published_at timestamptz, created_at timestamptz,
  advertiser text, advertiser_id uuid, images text[]
)
language sql security definer set search_path = public as $$
  select
    l.id, l.title, l.description, l.price, l.currency::text,
    l.condition::text, l.category_id, l.subcategory_id, l.location,
    l.status::text, l.featured, l.urgent, l.views,
    l.rejection_reason, l.published_at, l.created_at,
    p.full_name, l.owner_id,
    coalesce(
      (select array_agg(li.url order by li.sort_order)
         from public.listing_images li
        where li.listing_id = l.id),
      '{}'::text[]
    )
  from public.listings l
  left join public.profiles p on p.id = l.owner_id
  where public.has_perm('Gestión de avisos', 'view')
    and l.id = p_id;
$$;

-- Gestión de usuarios -------------------------------------------------------
create or replace function public.admin_set_user_status(
  p_user   uuid,
  p_status text,
  p_reason text default null,
  p_until  timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('Gestión de usuarios', 'edit') then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'banned', 'pending') then
    raise exception 'estado inválido: %', p_status;
  end if;
  if p_status = 'banned' and not public.has_role(auth.uid(), 'superadmin') then
    raise exception 'solo el superadmin puede banear permanentemente';
  end if;
  if p_user = auth.uid() then
    raise exception 'no puedes cambiar tu propio estado';
  end if;

  update public.profiles
  set status          = p_status,
      ban_reason      = case when p_status in ('banned','suspended') then p_reason else null end,
      suspended_until = case when p_status = 'suspended' then p_until else null end
  where id = p_user;

  perform public.log_audit(
    'set_user_status', 'user', p_user::text,
    jsonb_build_object('status', p_status, 'reason', p_reason, 'until', p_until)
  );
end;
$$;

-- Verificar un perfil es "aprobar", no "editar".
create or replace function public.admin_verify_user(p_user uuid, p_verified boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('Gestión de usuarios', 'approve') then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  update public.profiles set verified = p_verified where id = p_user;
  perform public.log_audit('verify_user', 'user', p_user::text,
                           jsonb_build_object('verified', p_verified));
end;
$$;

-- Conversaciones reportadas -------------------------------------------------
create or replace function public.admin_assign_report(p_report uuid, p_moderator uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('Conversaciones reportadas', 'edit') then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  update public.reports
  set assigned_to = p_moderator,
      status = case when status = 'open' then 'reviewing' else status end
  where id = p_report;
  perform public.log_audit('assign_report', 'report', p_report::text,
                           jsonb_build_object('moderator', p_moderator));
end;
$$;

-- Resolver una denuncia (0038): mismo cuerpo, con el permiso por delante.
create or replace function public.admin_resolve_report(p_report uuid, p_action text, p_note text default null)
returns void
language plpgsql security definer set search_path = 'public'
as $function$
declare
  v_report public.reports%rowtype;
  v_owner  uuid;
  v_title  text;
begin
  if not public.has_perm('Conversaciones reportadas', 'edit') then
    raise exception 'no autorizado' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'warn', 'remove', 'ban') then
    raise exception 'acción inválida: %', p_action;
  end if;

  select * into v_report from public.reports where id = p_report;
  if not found then raise exception 'denuncia no encontrada'; end if;

  v_owner := coalesce(
    v_report.target_user_id,
    (select owner_id from public.listings where id = v_report.listing_id)
  );

  if p_action = 'remove' and v_report.listing_id is not null then
    update public.listings
      set status = 'rejected', rejection_reason = coalesce(p_note, 'Removido por moderación')
      where id = v_report.listing_id;
    select title into v_title from public.listings where id = v_report.listing_id;
    perform public.notify_user(
      v_owner, 'listing_disabled', 'Aviso deshabilitado',
      jsonb_build_object('listing_title', v_title, 'reason', coalesce(p_note, v_report.reason), 'report_id', p_report)
    );
  elsif p_action = 'ban' then
    if v_owner is not null then
      update public.profiles
        set status = 'suspended', ban_reason = coalesce(p_note, v_report.reason)
        where id = v_owner;
      perform public.notify_user(
        v_owner, 'account_suspended', 'Tu cuenta fue suspendida',
        jsonb_build_object('reason', coalesce(p_note, v_report.reason), 'report_id', p_report)
      );
    end if;
  elsif p_action = 'warn' then
    perform public.notify_user(
      v_owner, 'moderation_warning', 'Advertencia de moderación',
      jsonb_build_object('reason', v_report.reason, 'note', p_note, 'report_id', p_report)
    );
  end if;

  update public.reports
    set status = 'resolved', action_taken = p_action, resolution_note = p_note,
        resolved_by = auth.uid(), resolved_at = now()
    where id = p_report;

  perform public.log_audit('resolve_report', 'report', p_report::text,
                           jsonb_build_object('action', p_action, 'note', p_note));
end;
$function$;

commit;
