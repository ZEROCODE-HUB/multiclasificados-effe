-- =====================================================================
-- 0006_functions_rls.sql — Funciones, triggers y políticas RLS
-- =====================================================================

-- ---------- Helpers de roles (SECURITY DEFINER evita recursión en RLS) ----------
create or replace function public.has_role(_uid uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _uid and role = _role
  );
$$;

create or replace function public.is_staff(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(_uid, 'admin') or public.has_role(_uid, 'superadmin');
$$;

-- ---------- Alta automática de perfil + rol al registrarse ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, full_name, initials, avatar_url)
  values (
    new.id,
    v_name,
    upper(left(v_name, 2)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  -- Rol por defecto: buscador. La app puede agregar 'anunciante' después.
  insert into public.user_roles (user_id, role) values (new.id, 'buscador');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Mantener updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles          enable row level security;
alter table public.user_roles        enable row level security;
alter table public.categories        enable row level security;
alter table public.listings          enable row level security;
alter table public.listing_images    enable row level security;
alter table public.listing_documents enable row level security;
alter table public.favorites         enable row level security;
alter table public.saved_searches    enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.job_applications  enable row level security;
alter table public.notifications     enable row level security;
alter table public.listing_events    enable row level security;
alter table public.pricing_settings  enable row level security;
alter table public.orders            enable row level security;
alter table public.order_listings    enable row level security;
alter table public.invoices          enable row level security;
alter table public.reports           enable row level security;
alter table public.communications    enable row level security;
alter table public.audit_logs        enable row level security;

-- ---------- profiles ----------
create policy "profiles_select_own"   on public.profiles for select using (id = auth.uid());
create policy "profiles_select_staff" on public.profiles for select using (public.is_staff(auth.uid()));
create policy "profiles_insert_own"   on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own"   on public.profiles for update using (id = auth.uid());
create policy "profiles_update_staff" on public.profiles for update using (public.is_staff(auth.uid()));

-- ---------- user_roles ----------
create policy "user_roles_select_own"   on public.user_roles for select using (user_id = auth.uid());
create policy "user_roles_select_staff" on public.user_roles for select using (public.is_staff(auth.uid()));
create policy "user_roles_manage_staff" on public.user_roles for all
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ---------- categories (lectura pública) ----------
create policy "categories_select_all"   on public.categories for select using (true);
create policy "categories_manage_staff" on public.categories for all
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ---------- listings ----------
create policy "listings_select_public" on public.listings for select
  using (status = 'active' or owner_id = auth.uid() or public.is_staff(auth.uid()));
create policy "listings_insert_own" on public.listings for insert
  with check (owner_id = auth.uid());
create policy "listings_update_own_or_staff" on public.listings for update
  using (owner_id = auth.uid() or public.is_staff(auth.uid()));
create policy "listings_delete_own_or_staff" on public.listings for delete
  using (owner_id = auth.uid() or public.is_staff(auth.uid()));

-- ---------- listing_images ----------
create policy "listing_images_select" on public.listing_images for select
  using (exists (
    select 1 from public.listings l where l.id = listing_id
    and (l.status = 'active' or l.owner_id = auth.uid() or public.is_staff(auth.uid()))
  ));
create policy "listing_images_write" on public.listing_images for all
  using (exists (
    select 1 from public.listings l where l.id = listing_id
    and (l.owner_id = auth.uid() or public.is_staff(auth.uid()))
  ))
  with check (exists (
    select 1 from public.listings l where l.id = listing_id
    and (l.owner_id = auth.uid() or public.is_staff(auth.uid()))
  ));

-- ---------- listing_documents (privado) ----------
create policy "listing_documents_access" on public.listing_documents for all
  using (exists (
    select 1 from public.listings l where l.id = listing_id
    and (l.owner_id = auth.uid() or public.is_staff(auth.uid()))
  ))
  with check (exists (
    select 1 from public.listings l where l.id = listing_id
    and (l.owner_id = auth.uid() or public.is_staff(auth.uid()))
  ));

-- ---------- favorites / saved_searches / notifications (solo dueño) ----------
create policy "favorites_own"      on public.favorites      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "saved_searches_own" on public.saved_searches for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_own"  on public.notifications  for select using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications for update using (user_id = auth.uid());
create policy "notifications_staff_insert" on public.notifications for insert with check (public.is_staff(auth.uid()) or user_id = auth.uid());

-- ---------- conversations / messages ----------
create policy "conversations_participants" on public.conversations for select
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_staff(auth.uid()));
create policy "conversations_insert" on public.conversations for insert
  with check (buyer_id = auth.uid() or seller_id = auth.uid());
create policy "conversations_update" on public.conversations for update
  using (buyer_id = auth.uid() or seller_id = auth.uid());

create policy "messages_select" on public.messages for select
  using (exists (
    select 1 from public.conversations c where c.id = conversation_id
    and (c.buyer_id = auth.uid() or c.seller_id = auth.uid() or public.is_staff(auth.uid()))
  ));
create policy "messages_insert" on public.messages for insert
  with check (sender_id = auth.uid() and exists (
    select 1 from public.conversations c where c.id = conversation_id
    and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  ));
create policy "messages_update_participant" on public.messages for update
  using (exists (
    select 1 from public.conversations c where c.id = conversation_id
    and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  ));

-- ---------- job_applications ----------
create policy "applications_select" on public.job_applications for select
  using (
    applicant_id = auth.uid()
    or public.is_staff(auth.uid())
    or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
  );
create policy "applications_insert_own" on public.job_applications for insert
  with check (applicant_id = auth.uid());
create policy "applications_update_owner" on public.job_applications for update
  using (
    public.is_staff(auth.uid())
    or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
  );

-- ---------- listing_events (cualquiera registra vistas; lee dueño/staff) ----------
create policy "listing_events_insert_any" on public.listing_events for insert with check (true);
create policy "listing_events_select" on public.listing_events for select
  using (
    public.is_staff(auth.uid())
    or exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid())
  );

-- ---------- pricing_settings (lectura pública; escribe staff) ----------
create policy "pricing_select_all"   on public.pricing_settings for select using (true);
create policy "pricing_manage_staff" on public.pricing_settings for all
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ---------- orders / order_listings / invoices ----------
create policy "orders_select_own"   on public.orders for select using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "orders_insert_own"    on public.orders for insert with check (user_id = auth.uid());
create policy "orders_update_staff"  on public.orders for update using (public.is_staff(auth.uid()));

create policy "order_listings_select" on public.order_listings for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff(auth.uid()))));
create policy "order_listings_insert" on public.order_listings for insert
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

create policy "invoices_select" on public.invoices for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff(auth.uid()))));
create policy "invoices_insert_staff" on public.invoices for insert with check (public.is_staff(auth.uid()));

-- ---------- reports ----------
create policy "reports_insert_auth" on public.reports for insert with check (auth.uid() is not null);
create policy "reports_select_staff" on public.reports for select using (public.is_staff(auth.uid()) or reported_by = auth.uid());
create policy "reports_update_staff" on public.reports for update using (public.is_staff(auth.uid()));

-- ---------- communications (anuncios) ----------
create policy "communications_select_all" on public.communications for select using (true);
create policy "communications_manage_staff" on public.communications for all
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ---------- audit_logs (solo superadmin lee; staff inserta) ----------
create policy "audit_select_superadmin" on public.audit_logs for select using (public.has_role(auth.uid(), 'superadmin'));
create policy "audit_insert_staff" on public.audit_logs for insert with check (public.is_staff(auth.uid()));

-- =====================================================================
-- Realtime: habilitar para el chat
-- =====================================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
