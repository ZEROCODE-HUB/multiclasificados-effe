-- =====================================================================
-- 0093 — La imagen por defecto de los avisos SIN FOTO, editable desde el panel.
--
-- Hasta ahora era una constante del código (`FALLBACK_IMG = "/aviso-sin-imagen
-- .jpg"` en src/lib/listings.ts): para cambiarla había que tocar el repositorio
-- y desplegar. Pasa a ser un ajuste del sistema con su imagen en Storage.
--
-- La imagen del bundle NO desaparece: sigue siendo el último recurso si no hay
-- ninguna configurada o si la consulta falla. Es decir, esto solo añade una
-- capa por encima; nunca deja un aviso sin imagen.
-- =====================================================================

begin;

-- ---------- 1) Bucket para las imágenes del propio sitio ----------
-- Se separa de `category-images` a propósito: aquello son fotos de catálogo y
-- esto es configuración de marca. Mismo tope de 5 MB, y sin allowed_mime_types
-- por el mismo motivo que allí: `compressImage` devuelve el archivo ORIGINAL si
-- el navegador no sabe exportar WebP (iOS antiguo sube HEIC), y una lista
-- blanca lo rechazaría con un error opaco. El tipo se valida en el cliente.
insert into storage.buckets (id, name, public, file_size_limit)
values ('site-assets', 'site-assets', true, 5242880)
on conflict (id) do nothing;

-- ---------- 2) Políticas ----------
-- Lectura pública (sin `to`: también anon; la portada se ve sin sesión).
drop policy if exists "site_assets_public_read" on storage.objects;
create policy "site_assets_public_read" on storage.objects for select
  using (bucket_id = 'site-assets');

-- Escritura para staff con permiso comercial, igual que las imágenes de
-- categoría (0077). La carpeta no puede ser el uid como en los buckets de
-- usuario: es un recurso compartido del sitio, así que el gate es el permiso.
--
-- Insert Y update por separado: `upsert: true` dispara una u otra según exista
-- ya el objeto.
drop policy if exists "site_assets_staff_insert" on storage.objects;
create policy "site_assets_staff_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-assets' and public.has_perm('Configuración comercial', 'edit'));

drop policy if exists "site_assets_staff_update" on storage.objects;
create policy "site_assets_staff_update" on storage.objects for update to authenticated
  using      (bucket_id = 'site-assets' and public.has_perm('Configuración comercial', 'edit'))
  with check (bucket_id = 'site-assets' and public.has_perm('Configuración comercial', 'edit'));

drop policy if exists "site_assets_staff_delete" on storage.objects;
create policy "site_assets_staff_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-assets' and public.has_perm('Configuración comercial', 'edit'));

-- ---------- 3) Cómo lo lee el visitante ----------
-- `get_settings()` filtra por `is_staff` y ni siquiera está concedida a `anon`,
-- así que no sirve para esto: la imagen la necesita CUALQUIERA que mire la
-- portada, tenga cuenta o no. Se expone solo este valor, igual que hizo la 0045
-- con el modo mantenimiento.
--
-- Devuelve null si no hay nada configurado; el cliente cae entonces a la imagen
-- que va en el bundle.
create or replace function public.default_listing_image()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(
    (select case jsonb_typeof(s.value)
              when 'string' then s.value #>> '{}'
              else null
            end
       from public.system_settings s
      where s.key = 'default_listing_image'),
    ''
  );
$$;

grant execute on function public.default_listing_image() to anon, authenticated;

comment on function public.default_listing_image() is
  'URL de la imagen que se muestra en los avisos sin foto. null = usar la del bundle.';

commit;
