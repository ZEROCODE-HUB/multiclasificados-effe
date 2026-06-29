-- =====================================================================
-- 0034_libro_reclamaciones.sql — Libro de Reclamaciones (Indecopi / Perú)
-- Registra los reclamos y quejas enviados desde la página principal. La
-- inserción la realiza la Edge Function `send-reclamo` con service_role; la
-- lectura queda restringida al staff (admin/superadmin/soporte) vía RLS.
-- =====================================================================

create table if not exists public.complaints (
  id          uuid primary key default gen_random_uuid(),
  -- Correlativo legible "Hoja de Reclamación N.º" (autoincremental).
  code        bigint generated always as identity,
  kind        text not null check (kind in ('reclamo', 'queja')),
  full_name   text not null,
  doc_type    text not null default 'DNI' check (doc_type in ('DNI','CE','Pasaporte','RUC')),
  doc_number  text not null,
  email       text not null,
  phone       text,
  address     text,
  good_type   text not null default 'servicio' check (good_type in ('producto','servicio')),
  amount      text,
  description text not null,
  request     text not null,
  -- Trazabilidad y estado de atención.
  status      text not null default 'pendiente' check (status in ('pendiente','en_proceso','resuelto')),
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists complaints_created_at_idx on public.complaints (created_at desc);
create index if not exists complaints_status_idx on public.complaints (status);

alter table public.complaints enable row level security;

-- Solo el staff puede ver y gestionar los reclamos.
drop policy if exists complaints_staff_select on public.complaints;
create policy complaints_staff_select on public.complaints
  for select using (public.is_staff(auth.uid()));

drop policy if exists complaints_staff_update on public.complaints;
create policy complaints_staff_update on public.complaints
  for update using (public.is_staff(auth.uid()));

-- No se define policy de INSERT para anon/authenticated: el alta llega siempre
-- por la Edge Function con service_role (que bypassa RLS). Así evitamos spam
-- directo contra la tabla desde el cliente.
