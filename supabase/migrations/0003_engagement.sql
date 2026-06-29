-- =====================================================================
-- 0003_engagement.sql — Favoritos, búsquedas, chat, postulaciones,
--                       notificaciones y eventos analíticos
-- =====================================================================

-- ---------- favorites ----------
create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ---------- saved_searches (alertas) ----------
create table public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  name          text,
  criteria      jsonb not null default '{}'::jsonb,  -- {category, priceMin, priceMax, location, sort}
  alert_enabled boolean not null default true,
  created_at    timestamptz not null default now()
);
create index saved_searches_user_idx on public.saved_searches (user_id);

-- ---------- conversations ----------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings (id) on delete cascade,
  buyer_id        uuid not null references public.profiles (id) on delete cascade,
  seller_id       uuid not null references public.profiles (id) on delete cascade,
  last_message    text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (listing_id, buyer_id, seller_id)
);
create index conversations_buyer_idx  on public.conversations (buyer_id);
create index conversations_seller_idx on public.conversations (seller_id);

-- ---------- messages (Realtime) ----------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------- job_applications (postulaciones a empleos) ----------
create table public.job_applications (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings (id) on delete cascade,
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  message      text,
  cv_url       text,
  status       public.application_status not null default 'pending',
  created_at   timestamptz not null default now(),
  unique (listing_id, applicant_id)
);
create index job_applications_listing_idx on public.job_applications (listing_id);

-- ---------- notifications (por usuario) ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at);

-- ---------- listing_events (analítica para KPIs/stats) ----------
create table public.listing_events (
  id         bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  type       text not null,   -- view | contact_click | phone_click
  created_at timestamptz not null default now()
);
create index listing_events_listing_idx on public.listing_events (listing_id, type);
