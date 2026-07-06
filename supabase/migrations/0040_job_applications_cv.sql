-- =====================================================================
-- 0040_job_applications_cv.sql — Postulaciones a empleos: CV en PDF + estados
-- · Nuevo estado "interview" (En entrevista) en el flujo de seguimiento.
-- · Bucket privado `cvs` para el PDF del postulante, con RLS: sube el
--   postulante (carpeta = su uid); descarga el postulante, staff o el dueño
--   del aviso al que se postuló (join por job_applications.cv_url).
-- La columna job_applications.cv_url ya existe (0003_engagement.sql).
-- Las políticas de job_applications ya cubren: select (postulante/dueño/staff),
-- insert (applicant_id = uid), update (dueño/staff → cambia estado).
-- =====================================================================

-- 1) Nuevo estado "En entrevista" (se ubica entre "reviewed" y "accepted").
alter type public.application_status add value if not exists 'interview' after 'reviewed';

-- 2) Bucket privado para los CV (PDF, máx 5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- 3) Políticas de storage para el bucket `cvs`.
drop policy if exists "cv_upload_own" on storage.objects;
create policy "cv_upload_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "cv_read_involved" on storage.objects;
create policy "cv_read_involved" on storage.objects for select to authenticated
  using (
    bucket_id = 'cvs' and (
      owner = auth.uid()
      or public.is_staff(auth.uid())
      or exists (
        select 1
        from public.job_applications ja
        join public.listings l on l.id = ja.listing_id
        where l.owner_id = auth.uid() and ja.cv_url = storage.objects.name
      )
    )
  );

drop policy if exists "cv_delete_own" on storage.objects;
create policy "cv_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and owner = auth.uid());
