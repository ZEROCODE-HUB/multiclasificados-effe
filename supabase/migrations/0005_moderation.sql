-- =====================================================================
-- 0005_moderation.sql — Reportes, comunicaciones y auditoría
-- =====================================================================

-- ---------- reports (denuncias de avisos; refleja ReportEntry) ----------
create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references public.listings (id) on delete cascade,
  reported_by   uuid references public.profiles (id) on delete set null,
  reason        text not null,
  category      text,
  status        public.report_status not null default 'open',
  resolved_by   uuid references public.profiles (id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index reports_status_idx  on public.reports (status);
create index reports_listing_idx on public.reports (listing_id);

-- ---------- communications (anuncios masivos del admin) ----------
create table public.communications (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  audience   text not null default 'all',  -- all | anunciantes | buscadores
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- audit_logs (auditoría superadmin) ----------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index audit_logs_actor_idx   on public.audit_logs (actor_id, created_at);
create index audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);
