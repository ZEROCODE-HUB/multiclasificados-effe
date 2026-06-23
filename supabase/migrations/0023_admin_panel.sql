-- =====================================================================
-- 0022_admin_panel.sql — Panel Superadmin (REQ-ADM-01..06)
-- Campos de control, RBAC, configuración del sistema y RPCs de gestión.
-- Idempotente: usa IF NOT EXISTS / CREATE OR REPLACE en todo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- REQ-ADM-06 — Roles adicionales para RBAC (moderador, soporte)
-- ADD VALUE IF NOT EXISTS es seguro y no rompe si ya existen.
-- ---------------------------------------------------------------------
alter type public.app_role add value if not exists 'moderador';
alter type public.app_role add value if not exists 'soporte';

-- ---------------------------------------------------------------------
-- REQ-ADM-03 — Campos de control para gestión crítica de usuarios
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists email           text;
alter table public.profiles add column if not exists suspended_until timestamptz; -- null + status=suspended => indefinido
alter table public.profiles add column if not exists ban_reason      text;
-- profiles.status ya existe: active | pending | suspended | banned
-- profiles.verified ya existe (verificación de identidad / perfil oficial)

create index if not exists profiles_email_idx  on public.profiles (lower(email));
create index if not exists profiles_status_idx on public.profiles (status);

-- Backfill del email desde auth.users (denormalizado para búsqueda del admin).
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and (p.email is null or p.email = '');

-- ---------------------------------------------------------------------
-- REQ-ADM-05 — Campos de control para moderación de denuncias
-- ---------------------------------------------------------------------
alter table public.reports add column if not exists assigned_to  uuid references public.profiles (id) on delete set null;
alter table public.reports add column if not exists action_taken text; -- dismiss | warn | remove | ban
create index if not exists reports_assigned_idx on public.reports (assigned_to);

-- ---------------------------------------------------------------------
-- REQ-ADM-06 — Matriz de permisos por rol (RBAC)
-- role como texto (incluye moderador/soporte sin acoplar al enum).
-- ---------------------------------------------------------------------
create table if not exists public.role_permissions (
  role        text    not null,
  module      text    not null,
  can_view    boolean not null default false,
  can_edit    boolean not null default false,
  can_approve boolean not null default false,
  can_delete  boolean not null default false,
  primary key (role, module)
);

-- ---------------------------------------------------------------------
-- REQ-ADM-04 — Variables globales del sistema (configuración comercial)
-- ---------------------------------------------------------------------
create table if not exists public.system_settings (
  key         text primary key,
  value       jsonb       not null default '{}'::jsonb,
  label       text,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS de las tablas nuevas
-- ---------------------------------------------------------------------
alter table public.role_permissions enable row level security;
alter table public.system_settings  enable row level security;

drop policy if exists "role_perms_select_staff" on public.role_permissions;
create policy "role_perms_select_staff" on public.role_permissions for select
  using (public.is_staff(auth.uid()));

drop policy if exists "role_perms_manage_super" on public.role_permissions;
create policy "role_perms_manage_super" on public.role_permissions for all
  using (public.has_role(auth.uid(), 'superadmin'))
  with check (public.has_role(auth.uid(), 'superadmin'));

drop policy if exists "settings_select_staff" on public.system_settings;
create policy "settings_select_staff" on public.system_settings for select
  using (public.is_staff(auth.uid()));

drop policy if exists "settings_manage_super" on public.system_settings;
create policy "settings_manage_super" on public.system_settings for all
  using (public.has_role(auth.uid(), 'superadmin'))
  with check (public.has_role(auth.uid(), 'superadmin'));

-- =====================================================================
-- HELPERS DE AUDITORÍA
-- =====================================================================

-- REQ-ADM-02 — Registro de auditoría de cualquier acción del staff.
create or replace function public.log_audit(
  p_action      text,
  p_entity_type text default null,
  p_entity_id   text default null,
  p_metadata    jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- =====================================================================
-- REQ-ADM-01 — DASHBOARD ANALÍTICO
-- =====================================================================
create or replace function public.admin_stats()
returns jsonb
language sql security definer set search_path = public as $$
  select case when public.is_staff(auth.uid()) then jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'active_listings',  (select count(*) from public.listings where status = 'active'),
    'pending_listings', (select count(*) from public.listings where status = 'pending'),
    'sold_listings',    (select count(*) from public.listings where status = 'sold'),
    'total_listings',   (select count(*) from public.listings),
    'reports_open',     (select count(*) from public.reports  where status = 'open'),
    'revenue',          coalesce((select sum(total) from public.orders where status = 'paid'), 0)
  ) else '{}'::jsonb end;
$$;

-- Serie de crecimiento (ingresos + usuarios nuevos) de los últimos 6 meses.
create or replace function public.admin_growth_series()
returns table (mes text, ingresos numeric, usuarios bigint)
language sql security definer set search_path = public as $$
  with months as (
    select date_trunc('month', now()) - (interval '1 month' * g) as m
    from generate_series(5, 0, -1) g
  )
  select
    to_char(m, 'Mon') as mes,
    coalesce((select sum(o.total) from public.orders o
              where o.status = 'paid' and date_trunc('month', o.created_at) = m), 0) as ingresos,
    (select count(*) from public.profiles p
     where date_trunc('month', p.created_at) = m) as usuarios
  from months
  where public.is_staff(auth.uid());
$$;

-- Distribución de avisos por categoría (para el gráfico de torta).
create or replace function public.admin_category_distribution()
returns table (name text, value bigint)
language sql security definer set search_path = public as $$
  select coalesce(c.name, l.category_id) as name, count(*) as value
  from public.listings l
  left join public.categories c on c.id = l.category_id
  where public.is_staff(auth.uid())
  group by coalesce(c.name, l.category_id)
  order by value desc;
$$;

-- =====================================================================
-- REQ-ADM-03 — GESTIÓN DE USUARIOS
-- =====================================================================

-- Listado de usuarios con email, roles, estado y nº de avisos.
create or replace function public.admin_list_users(
  p_search text default null,
  p_role   text default null,
  p_limit  int  default 100,
  p_offset int  default 0
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
  order by p.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- Cambio de estado: active | suspended | banned | pending.
-- Banear (permanente) requiere superadmin; suspender lo puede hacer cualquier staff.
create or replace function public.admin_set_user_status(
  p_user   uuid,
  p_status text,
  p_reason text default null,
  p_until  timestamptz default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
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

-- Verificación de identidad / perfil oficial.
create or replace function public.admin_verify_user(p_user uuid, p_verified boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  update public.profiles set verified = p_verified where id = p_user;
  perform public.log_audit('verify_user', 'user', p_user::text,
                           jsonb_build_object('verified', p_verified));
end;
$$;

-- Visor de actividad de un usuario (sus avisos + acciones del staff sobre él).
create or replace function public.admin_user_activity(p_user uuid)
returns table (kind text, label text, detail text, at timestamptz)
language sql security definer set search_path = public as $$
  select 'listing'::text, l.title, l.status::text, l.created_at
  from public.listings l
  where public.is_staff(auth.uid()) and l.owner_id = p_user
  union all
  select 'audit'::text, a.action, a.entity_id, a.created_at
  from public.audit_logs a
  where public.is_staff(auth.uid()) and a.entity_type = 'user' and a.entity_id = p_user::text
  order by 4 desc
  limit 50;
$$;

-- =====================================================================
-- REQ-ADM-02 — GESTIÓN DE AVISOS
-- =====================================================================
create or replace function public.admin_set_listing_status(p_listing uuid, p_status public.listing_status)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
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
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  update public.listings set featured = p_featured where id = p_listing;
  perform public.log_audit('toggle_featured', 'listing', p_listing::text,
                           jsonb_build_object('featured', p_featured));
end;
$$;

-- Listado de avisos para el panel (todos los estados, con anunciante).
create or replace function public.admin_list_listings(
  p_search text default null,
  p_status text default null,
  p_limit  int  default 100,
  p_offset int  default 0
) returns table (
  id uuid, title text, category_id text, status text, featured boolean,
  price numeric, currency text, advertiser text, views int, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select l.id, l.title, l.category_id, l.status::text, l.featured,
         l.price, l.currency::text, p.full_name, l.views, l.created_at
  from public.listings l
  left join public.profiles p on p.id = l.owner_id
  where public.is_staff(auth.uid())
    and (p_search is null or p_search = '' or l.title ilike '%' || p_search || '%')
    and (p_status is null or p_status = '' or l.status::text = p_status)
  order by l.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- =====================================================================
-- REQ-ADM-05 — MODERACIÓN DE DENUNCIAS
-- =====================================================================
create or replace function public.admin_list_reports()
returns table (
  id uuid, target_type text, reason text, category text, status text,
  action_taken text, reporter text, reported text, reported_id uuid,
  listing_id uuid, listing_title text, assigned_to uuid, assignee text,
  created_at timestamptz
)
language sql security definer set search_path = public as $$
  select
    r.id, r.target_type::text, r.reason, r.category, r.status::text, r.action_taken,
    rep.full_name as reporter,
    coalesce(tu.full_name, lo.full_name) as reported,
    coalesce(r.target_user_id, lo.id) as reported_id,
    r.listing_id, l.title as listing_title,
    r.assigned_to, asg.full_name as assignee,
    r.created_at
  from public.reports r
  left join public.profiles rep on rep.id = r.reported_by
  left join public.profiles tu  on tu.id  = r.target_user_id
  left join public.listings  l  on l.id   = r.listing_id
  left join public.profiles lo  on lo.id  = l.owner_id
  left join public.profiles asg on asg.id = r.assigned_to
  where public.is_staff(auth.uid())
  order by
    case r.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    r.created_at desc;
$$;

-- Asignar una denuncia a un moderador (pasa a "reviewing").
create or replace function public.admin_assign_report(p_report uuid, p_moderator uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  update public.reports
  set assigned_to = p_moderator,
      status = case when status = 'open' then 'reviewing' else status end
  where id = p_report;
  perform public.log_audit('assign_report', 'report', p_report::text,
                           jsonb_build_object('moderator', p_moderator));
end;
$$;

-- Resolver una denuncia: dismiss | warn | remove | ban.
-- 'remove' baja el aviso; 'ban' suspende/banea al usuario objetivo.
create or replace function public.admin_resolve_report(
  p_report uuid,
  p_action text,
  p_note   text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_report public.reports%rowtype;
  v_owner  uuid;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  if p_action not in ('dismiss', 'warn', 'remove', 'ban') then
    raise exception 'acción inválida: %', p_action;
  end if;

  select * into v_report from public.reports where id = p_report;
  if not found then raise exception 'denuncia no encontrada'; end if;

  -- Efecto colateral según la acción.
  if p_action = 'remove' and v_report.listing_id is not null then
    update public.listings set status = 'rejected', rejection_reason = coalesce(p_note, 'Removido por moderación')
    where id = v_report.listing_id;
  elsif p_action = 'ban' then
    v_owner := coalesce(
      v_report.target_user_id,
      (select owner_id from public.listings where id = v_report.listing_id)
    );
    if v_owner is not null then
      update public.profiles set status = 'suspended', ban_reason = coalesce(p_note, v_report.reason)
      where id = v_owner;
    end if;
  end if;

  update public.reports
  set status = 'resolved', action_taken = p_action, resolution_note = p_note,
      resolved_by = auth.uid(), resolved_at = now()
  where id = p_report;

  perform public.log_audit('resolve_report', 'report', p_report::text,
                           jsonb_build_object('action', p_action, 'note', p_note));
end;
$$;

-- =====================================================================
-- REQ-ADM-06 — RBAC (asignación de roles + matriz de permisos)
-- =====================================================================
create or replace function public.admin_assign_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'superadmin') then
    raise exception 'solo el superadmin gestiona roles';
  end if;
  insert into public.user_roles (user_id, role) values (p_user, p_role)
  on conflict (user_id, role) do nothing;
  perform public.log_audit('assign_role', 'user', p_user::text,
                           jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.admin_remove_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'superadmin') then
    raise exception 'solo el superadmin gestiona roles';
  end if;
  delete from public.user_roles where user_id = p_user and role = p_role;
  perform public.log_audit('remove_role', 'user', p_user::text,
                           jsonb_build_object('role', p_role));
end;
$$;

-- Permisos del usuario actual (para que el frontend muestre/oculte acciones).
create or replace function public.get_my_permissions()
returns table (module text, can_view boolean, can_edit boolean, can_approve boolean, can_delete boolean)
language sql security definer set search_path = public as $$
  select rp.module,
         bool_or(rp.can_view), bool_or(rp.can_edit), bool_or(rp.can_approve), bool_or(rp.can_delete)
  from public.role_permissions rp
  join public.user_roles ur on ur.role::text = rp.role
  where ur.user_id = auth.uid()
  group by rp.module;
$$;

create or replace function public.set_role_permission(
  p_role text, p_module text,
  p_view boolean, p_edit boolean, p_approve boolean, p_delete boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'superadmin') then
    raise exception 'solo el superadmin edita permisos';
  end if;
  insert into public.role_permissions (role, module, can_view, can_edit, can_approve, can_delete)
  values (p_role, p_module, p_view, p_edit, p_approve, p_delete)
  on conflict (role, module) do update
    set can_view = excluded.can_view, can_edit = excluded.can_edit,
        can_approve = excluded.can_approve, can_delete = excluded.can_delete;
  perform public.log_audit('set_role_permission', 'role', p_role,
                           jsonb_build_object('module', p_module,
                             'view', p_view, 'edit', p_edit, 'approve', p_approve, 'delete', p_delete));
end;
$$;

-- Listado de la matriz completa (para la UI de Roles).
create or replace function public.admin_list_permissions()
returns setof public.role_permissions
language sql security definer set search_path = public as $$
  select * from public.role_permissions
  where public.is_staff(auth.uid())
  order by role, module;
$$;

-- Conteo de usuarios por rol (tarjetas de la pantalla Roles).
create or replace function public.admin_role_counts()
returns table (role text, total bigint)
language sql security definer set search_path = public as $$
  select ur.role::text, count(distinct ur.user_id)
  from public.user_roles ur
  where public.is_staff(auth.uid())
  group by ur.role::text;
$$;

-- =====================================================================
-- REQ-ADM-04 — CONFIGURACIÓN DEL SISTEMA
-- =====================================================================
create or replace function public.get_settings()
returns setof public.system_settings
language sql security definer set search_path = public as $$
  select * from public.system_settings where public.is_staff(auth.uid()) order by key;
$$;

create or replace function public.set_setting(p_key text, p_value jsonb, p_label text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'superadmin') then
    raise exception 'solo el superadmin cambia la configuración';
  end if;
  insert into public.system_settings (key, value, label, updated_by, updated_at)
  values (p_key, p_value, p_label, auth.uid(), now())
  on conflict (key) do update
    set value = excluded.value,
        label = coalesce(excluded.label, public.system_settings.label),
        updated_by = auth.uid(), updated_at = now();
  perform public.log_audit('set_setting', 'setting', p_key, jsonb_build_object('value', p_value));
end;
$$;

-- =====================================================================
-- GRANTS — todas las RPCs son security definer y validan el rol adentro.
-- =====================================================================
grant execute on function public.log_audit(text, text, text, jsonb)                 to authenticated;
grant execute on function public.admin_stats()                                       to authenticated;
grant execute on function public.admin_growth_series()                               to authenticated;
grant execute on function public.admin_category_distribution()                       to authenticated;
grant execute on function public.admin_list_users(text, text, int, int)              to authenticated;
grant execute on function public.admin_set_user_status(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.admin_verify_user(uuid, boolean)                    to authenticated;
grant execute on function public.admin_user_activity(uuid)                           to authenticated;
grant execute on function public.admin_set_listing_status(uuid, public.listing_status) to authenticated;
grant execute on function public.admin_toggle_featured(uuid, boolean)                to authenticated;
grant execute on function public.admin_list_listings(text, text, int, int)           to authenticated;
grant execute on function public.admin_list_reports()                                to authenticated;
grant execute on function public.admin_assign_report(uuid, uuid)                     to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text)              to authenticated;
grant execute on function public.admin_assign_role(uuid, public.app_role)            to authenticated;
grant execute on function public.admin_remove_role(uuid, public.app_role)            to authenticated;
grant execute on function public.get_my_permissions()                                to authenticated;
grant execute on function public.set_role_permission(text, text, boolean, boolean, boolean, boolean) to authenticated;
grant execute on function public.admin_list_permissions()                            to authenticated;
grant execute on function public.admin_role_counts()                                 to authenticated;
grant execute on function public.get_settings()                                      to authenticated;
grant execute on function public.set_setting(text, jsonb, text)                      to authenticated;

-- =====================================================================
-- Trigger: mantener profiles.email sincronizado al crear usuarios nuevos.
-- (Reemplaza handle_new_user agregando el email; conserva el comportamiento.)
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, full_name, initials, avatar_url, email)
  values (new.id, v_name, upper(left(v_name, 2)), new.raw_user_meta_data ->> 'avatar_url', new.email);
  insert into public.user_roles (user_id, role) values (new.id, 'buscador');
  return new;
end;
$$;
