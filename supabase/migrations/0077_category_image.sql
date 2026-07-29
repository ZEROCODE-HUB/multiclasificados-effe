-- =====================================================================
-- 0077_category_image.sql — Imagen de portada por categoría
--
-- Hasta aquí la foto de cada tarjeta de la portada estaba HARDCODEADA en
-- src/components/CategoryGrid.tsx (8 ids de Unsplash indexados por slug), y
-- las categorías que creaba el staff caían a un degradado sólido porque su
-- slug no existía en ese mapa.
--
-- Ahora la imagen vive en la BD (categories.image_url) y el staff la cambia
-- subiendo un archivo desde Panel → Configuración comercial → Categorías.
-- El seed replica exactamente las 8 fotos anteriores para que la portada se
-- vea igual desde el primer despliegue.
--
-- Idempotente.
-- =====================================================================

begin;

-- ---------- 1) Columna ----------
alter table public.categories
  add column if not exists image_url text;

comment on column public.categories.image_url is
  'URL pública de la foto de portada de la categoría (bucket category-images, o Unsplash del seed). NULL = la portada usa una foto de reserva del pool.';

-- ---------- 2) Seed: las 8 fotos que estaban en CategoryGrid.tsx ----------
-- Se piden a 800x600: es el escalón más grande que sirve la portada; el resto
-- se deriva por querystring. `where image_url is null` evita pisar una imagen
-- ya subida por el staff si la migración se vuelve a aplicar.
update public.categories c
   set image_url = v.url
  from (values
    ('inmuebles',          'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&h=600&fit=crop&auto=format&q=70'),
    ('vehiculos',          'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop&auto=format&q=70'),
    ('empleos',            'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&h=600&fit=crop&auto=format&q=70'),
    ('tecnologia',         'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=600&fit=crop&auto=format&q=70'),
    ('productos',          'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&h=600&fit=crop&auto=format&q=70'),
    ('servicios',          'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800&h=600&fit=crop&auto=format&q=70'),
    ('educacion-finanzas', 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&h=600&fit=crop&auto=format&q=70'),
    ('salud-belleza-moda', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&h=600&fit=crop&auto=format&q=70')
  ) as v(id, url)
 where c.id = v.id
   and c.image_url is null;

-- ---------- 3) Bucket público ----------
-- Sin allowed_mime_types a propósito: compressImage devuelve el archivo
-- ORIGINAL si el navegador no puede exportar WebP en canvas (iOS antiguo sube
-- HEIC), y una lista blanca lo rechazaría con un error opaco. El tipo se valida
-- en el cliente. 5 MB de tope: una portada comprimida pesa 150-400 KB.
insert into storage.buckets (id, name, public, file_size_limit)
values ('category-images', 'category-images', true, 5242880)
on conflict (id) do nothing;

-- ---------- 4) Políticas de storage ----------
-- Lectura pública (sin `to`: también anon, la portada se ve sin sesión).
drop policy if exists "category_images_public_read" on storage.objects;
create policy "category_images_public_read" on storage.objects for select
  using (bucket_id = 'category-images');

-- Escritura: MISMO permiso que ya rige la tabla categories
-- (categories_write_matrix, 0065). El superadmin siempre pasa porque has_perm
-- devuelve true para él. OJO: aquí la carpeta NO puede ser el uid como en los
-- demás buckets (0007) — es el slug de la categoría, que es compartido, así que
-- el gate es el permiso, no la carpeta.
--
-- Hacen falta insert Y update por separado: `upsert: true` dispara una u otra
-- según exista ya el objeto.
drop policy if exists "category_images_staff_insert" on storage.objects;
create policy "category_images_staff_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'category-images' and public.has_perm('Configuración comercial', 'edit'));

drop policy if exists "category_images_staff_update" on storage.objects;
create policy "category_images_staff_update" on storage.objects for update to authenticated
  using      (bucket_id = 'category-images' and public.has_perm('Configuración comercial', 'edit'))
  with check (bucket_id = 'category-images' and public.has_perm('Configuración comercial', 'edit'));

drop policy if exists "category_images_staff_delete" on storage.objects;
create policy "category_images_staff_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'category-images' and public.has_perm('Configuración comercial', 'edit'));

commit;
