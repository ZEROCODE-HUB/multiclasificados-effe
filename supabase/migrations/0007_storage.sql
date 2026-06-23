-- =====================================================================
-- 0007_storage.sql — Buckets de Storage y sus políticas
-- =====================================================================

insert into storage.buckets (id, name, public)
values
  ('listing-images', 'listing-images', true),
  ('avatars',        'avatars',        true),
  ('listing-docs',   'listing-docs',   false)
on conflict (id) do nothing;

-- ---------- listing-images (lectura pública; escribe el dueño en su carpeta) ----------
create policy "listing_images_public_read" on storage.objects for select
  using (bucket_id = 'listing-images');

create policy "listing_images_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing_images_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing_images_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- avatars (lectura pública; escribe el dueño en su carpeta) ----------
create policy "avatars_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_write" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- listing-docs (privado: solo el dueño; servir vía URLs firmadas) ----------
create policy "listing_docs_owner_read" on storage.objects for select to authenticated
  using (bucket_id = 'listing-docs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "listing_docs_owner_write" on storage.objects for all to authenticated
  using (bucket_id = 'listing-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'listing-docs' and (storage.foldername(name))[1] = auth.uid()::text);
