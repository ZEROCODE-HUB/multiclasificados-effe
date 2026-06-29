-- =====================================================================
-- 0015_reports_moderation.sql — REQ-10: moderación de avisos Y usuarios
-- (reportes polimórficos con estados de revisión) (idempotente)
-- =====================================================================

-- El reporte puede apuntar a un aviso o a un usuario.
alter table public.reports add column if not exists target_type public.report_target_type not null default 'listing';
alter table public.reports add column if not exists target_user_id uuid references public.profiles (id) on delete set null;
alter table public.reports add column if not exists resolution_note text;

-- listing_id deja de ser obligatorio (cuando se reporta a un usuario).
alter table public.reports alter column listing_id drop not null;

-- Debe apuntar exactamente a uno de los dos objetivos.
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_target_check'
  ) then
    alter table public.reports add constraint reports_target_check check (
      (target_type = 'listing' and listing_id is not null)
      or (target_type = 'user' and target_user_id is not null)
    );
  end if;
end $$;

create index if not exists reports_target_user_idx on public.reports (target_user_id);

-- RLS ya estaba activa; reforzamos las políticas (insert por autenticado, gestión staff).
drop policy if exists "reports_insert_auth" on public.reports;
create policy "reports_insert_auth" on public.reports for insert
  with check (auth.uid() is not null and (reported_by = auth.uid() or reported_by is null));

drop policy if exists "reports_select_staff" on public.reports;
create policy "reports_select_staff" on public.reports for select
  using (public.is_staff(auth.uid()) or reported_by = auth.uid());

drop policy if exists "reports_update_staff" on public.reports;
create policy "reports_update_staff" on public.reports for update
  using (public.is_staff(auth.uid()));
