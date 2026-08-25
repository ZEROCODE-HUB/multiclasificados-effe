-- =====================================================================
-- 0122_adjuntos_huerfanos.sql — Encontrar los archivos que ya no son de nadie
--
-- POR QUÉ HACE FALTA
--
-- Un archivo del bucket pertenece a un aviso por su ruta: `<usuario>/<aviso>/…`.
-- Cuando el aviso desaparece —lo borra su dueño, lo borra un administrador, o
-- nunca llegó a existir— el archivo se queda. Nadie lo ve y nadie lo borra, pero
-- ocupa y se paga. Al escribir esto había ya 32 archivos así en producción, de
-- avisos borrados: no es un problema teórico ni lo trae la subida anticipada,
-- solo que ahora hay una segunda vía por la que aparecen.
--
-- La otra vía es esa: desde la 9.1 los adjuntos suben MIENTRAS se rellena el
-- formulario, para que "Publicar" no espere a 46 MB de vídeo. Quien empieza un
-- aviso, sube una foto y se marcha sin publicar deja esa foto en el bucket.
-- Es el precio de que publicar sea instantáneo, y se paga barriendo después.
--
-- LO QUE ESTA MIGRACIÓN HACE Y LO QUE NO
--
-- Solo IDENTIFICA. No borra nada: quitar la fila de `storage.objects` no libera
-- el archivo de verdad —se queda en el almacén sin índice, que es peor que
-- antes—, así que el borrado tiene que ir por la API de Storage. De eso se
-- encarga la función `limpiar-adjuntos`, que llama a esta para saber qué tocar.
--
-- LOS SEGUROS, QUE AQUÍ IMPORTAN MÁS QUE LA CONSULTA
--
-- Esto alimenta un borrado automático de archivos de usuarios. Un fallo aquí no
-- es un error en pantalla: son fotos que no vuelven. Por eso:
--
--   1. Solo mira TRES buckets. Los avatares, los CV de las postulaciones y las
--      imágenes del sitio no se tocan ni por accidente.
--   2. Solo archivos con más de `p_dias` días (3 por defecto). Un formulario a
--      medio rellenar jamás está en riesgo: nadie tarda tres días en publicar.
--   3. Solo si el segundo tramo de la ruta ES un identificador válido. Cualquier
--      cosa con otra forma se queda donde está, aunque parezca basura.
--   4. Y solo si ese aviso NO existe. Mientras el aviso viva, sus archivos son
--      suyos aunque no estén enlazados en ninguna fila.
-- =====================================================================

create or replace function public.adjuntos_huerfanos(p_dias integer default 3)
returns table(bucket_id text, name text, bytes bigint)
language sql
stable
security definer
set search_path = public, storage
as $$
  with candidatos as (
    select
      o.bucket_id::text as bucket_id,
      o.name::text      as name,
      coalesce((o.metadata ->> 'size')::bigint, 0) as bytes,
      -- El identificador del aviso vive en el segundo tramo de la ruta
      -- (`<usuario>/<aviso>/archivo`). Los PDF antiguos usaban otra forma,
      -- `<usuario>/<aviso>.pdf`, así que se mira también el nombre del archivo
      -- sin extensión: si no, los documentos viejos no se limpiarían nunca.
      coalesce(
        nullif((storage.foldername(o.name))[2], ''),
        regexp_replace(split_part(o.name, '/', 2), '\.[A-Za-z0-9]+$', '')
      ) as posible_aviso
    from storage.objects o
    where o.bucket_id in ('listing-images', 'listing-videos', 'listing-docs')
      -- Nada recién subido: el formulario que se está rellenando ahora mismo
      -- todavía no tiene aviso, y borrárselo sería romperlo en la cara.
      and o.created_at < now() - make_interval(days => greatest(p_dias, 1))
  )
  select c.bucket_id, c.name, c.bytes
  from candidatos c
  where c.posible_aviso ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1 from public.listings l where l.id = c.posible_aviso::uuid
    );
$$;

-- Nadie desde el navegador. La llama la función de limpieza, que corre con la
-- llave de servicio: con EXECUTE abierto, cualquiera podría enumerar las rutas
-- de los archivos de todos los usuarios.
revoke execute on function public.adjuntos_huerfanos(integer) from public, anon, authenticated;
grant  execute on function public.adjuntos_huerfanos(integer) to service_role;

-- Cuánto hay acumulado, para poder vigilarlo sin tener que borrar nada.
create or replace function public.resumen_adjuntos_huerfanos(p_dias integer default 3)
returns table(bucket_id text, archivos bigint, bytes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select h.bucket_id, count(*)::bigint, coalesce(sum(h.bytes), 0)::bigint
  from public.adjuntos_huerfanos(p_dias) h
  group by h.bucket_id;
$$;

revoke execute on function public.resumen_adjuntos_huerfanos(integer) from public, anon, authenticated;
grant  execute on function public.resumen_adjuntos_huerfanos(integer) to service_role;
