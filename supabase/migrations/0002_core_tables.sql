-- =====================================================================
-- 0002_core_tables.sql — Perfiles, roles, categorías y avisos
-- =====================================================================

-- ---------- profiles (1:1 con auth.users) ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  initials    text,
  phone       text,
  doc_type    public.doc_type,
  doc_number  text,
  verified    boolean not null default false,
  status      text    not null default 'active',  -- active | suspended | pending
  rating      numeric(2,1) not null default 0.0,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Vista pública: SOLO columnas seguras del perfil (sin doc_number/phone).
-- Se usa para mostrar al anunciante en el detalle del aviso.
create view public.public_profiles as
  select id, full_name, initials, avatar_url, rating, verified
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- ---------- user_roles (multi-rol; recomendado por Supabase) ----------
create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role    public.app_role not null,
  primary key (user_id, role)
);

-- ---------- categories ----------
create table public.categories (
  id         text primary key,          -- slug: inmuebles, vehiculos, ...
  name       text not null,
  icon       text not null,             -- nombre del icono lucide-react
  sort_order int  not null default 0,
  active     boolean not null default true
);

-- ---------- listings (entidad central) ----------
create table public.listings (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  category_id     text not null references public.categories (id),
  title           text not null,
  description     text,
  price           numeric(12,2) not null default 0,
  currency        public.currency not null default 'PEN',
  condition       public.listing_condition not null default 'na',
  location        text,
  lat             numeric(9,6),
  lng             numeric(9,6),
  status          public.listing_status not null default 'draft',
  featured        boolean not null default false,
  urgent          boolean not null default false,
  confidential    boolean not null default false,
  views           int not null default 0,
  published_at    timestamptz,
  expires_at      timestamptz,
  rejection_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index listings_status_category_idx on public.listings (status, category_id);
create index listings_owner_idx           on public.listings (owner_id);
create index listings_search_idx          on public.listings
  using gin (to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(description,'')));

-- ---------- listing_images ----------
create table public.listing_images (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  storage_path text,
  url          text not null,
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);
create index listing_images_listing_idx on public.listing_images (listing_id);

-- ---------- listing_documents (PDFs / confidencial) ----------
create table public.listing_documents (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  kind         text not null default 'pdf',
  created_at   timestamptz not null default now()
);
create index listing_documents_listing_idx on public.listing_documents (listing_id);
