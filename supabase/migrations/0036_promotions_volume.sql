-- =====================================================================
-- 0036_promotions_volume.sql
--   (1) Sistema de Promociones por categoría y período.
--   (2) Descuentos por cantidad "reales" (uno por nivel, no promediado).
-- =====================================================================

-- ---------- (1) Promociones ----------
create table if not exists public.promotions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  discount_pct numeric not null check (discount_pct >= 0 and discount_pct <= 100),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  category_ids text[] not null default '{}',   -- vacío = todas las categorías
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);

alter table public.promotions enable row level security;

-- Lectura pública: el flujo de publicar necesita conocer las promos vigentes.
drop policy if exists "promotions_select_all" on public.promotions;
create policy "promotions_select_all" on public.promotions for select using (true);

-- Gestión (crear/editar/borrar): solo staff (admin / superadmin).
drop policy if exists "promotions_manage_staff" on public.promotions;
create policy "promotions_manage_staff" on public.promotions for all
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create index if not exists promotions_window_idx
  on public.promotions (is_active, starts_at, ends_at);

-- ---------- (2) Descuento por cantidad real ----------
-- Guarda el % (decimal) de descuento vs. el nivel anterior para cada cantidad.
-- Ej. [0,0,0.06,0.06,...] → n=1 sin descuento, cada nivel adicional -6%.
alter table public.pricing_settings
  add column if not exists desc_cantidad jsonb;
