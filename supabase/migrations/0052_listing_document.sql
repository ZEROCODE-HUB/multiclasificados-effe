-- =====================================================================
-- 0052_listing_document.sql — PDF adjunto del aviso
-- Guarda la ruta del PDF que sube el anunciante (adicional "PDF adjunto") y
-- permite que cualquiera lo lea desde el detalle del aviso. Idempotente.
-- =====================================================================

alter table public.listings add column if not exists document_url text;

-- Lectura pública del bucket listing-docs: además del dueño (política previa),
-- cualquier visitante puede pedir un enlace firmado del PDF desde el detalle.
-- La escritura sigue restringida al dueño (listing_docs_owner_write).
drop policy if exists "listing_docs_public_read" on storage.objects;
create policy "listing_docs_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'listing-docs');
