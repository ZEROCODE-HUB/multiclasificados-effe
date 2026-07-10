-- =====================================================================
-- 0054_app_version_check.sql — verificador de versión de la App móvil.
--
-- La app nativa compara SU build instalado (App.getInfo().build) contra la
-- última publicada, guardada en `system_settings`. Si está por debajo del
-- mínimo soportado, se le obliga a actualizar (modal bloqueante); si solo está
-- por debajo de la última, se le sugiere (modal cerrable).
--
-- Claves usadas en system_settings (todas jsonb):
--   app_latest_build  -> int  (último versionCode publicado)
--   app_min_build     -> int  (versionCode mínimo que puede seguir usándose)
--   app_version_name  -> text (p.ej. "1.9", solo para mostrar)
--   app_download_url  -> text (dónde descargar el APK nuevo)
--   app_update_notes  -> text (novedades, opcional)
--   app_ota_version   -> text (versión del bundle OTA de Capgo; vacío = sin OTA)
--   app_ota_url       -> text (URL del .zip del bundle OTA; vacío = sin OTA)
--
-- La función la consulta cualquiera (también sin sesión): la comprobación de
-- versión ocurre antes de loguearse. Devuelve un único jsonb; nada sensible.
-- Idempotente.
-- =====================================================================

create or replace function public.get_app_version_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select key, value from public.system_settings
    where key in ('app_latest_build', 'app_min_build', 'app_version_name',
                  'app_download_url', 'app_update_notes', 'app_ota_version', 'app_ota_url')
  )
  select jsonb_build_object(
    'latest_build',  coalesce(nullif((select value #>> '{}' from s where key = 'app_latest_build'), '')::int, 0),
    'min_build',     coalesce(nullif((select value #>> '{}' from s where key = 'app_min_build'), '')::int, 0),
    'version_name',  coalesce((select value #>> '{}' from s where key = 'app_version_name'), ''),
    'download_url',  coalesce((select value #>> '{}' from s where key = 'app_download_url'), ''),
    'notes',         coalesce((select value #>> '{}' from s where key = 'app_update_notes'), ''),
    'ota_version',   coalesce((select value #>> '{}' from s where key = 'app_ota_version'), ''),
    'ota_url',       coalesce((select value #>> '{}' from s where key = 'app_ota_url'), '')
  );
$$;

grant execute on function public.get_app_version_info() to anon, authenticated;

-- Semilla con el build ACTUAL (versionCode 10 / versionName 1.9) para que la app
-- no crea que está desactualizada. Al publicar un APK nuevo se sube app_latest_build
-- (y app_min_build si se quiere forzar). No se pisan valores ya configurados.
insert into public.system_settings (key, value, label) values
  ('app_latest_build', '10'::jsonb,   'App: último versionCode publicado'),
  ('app_min_build',    '1'::jsonb,    'App: versionCode mínimo soportado (fuerza actualización)'),
  ('app_version_name', '"1.9"'::jsonb, 'App: nombre de versión visible'),
  ('app_download_url', '"https://github.com/CorpLozanocheffer/multiclasificados-effe/releases/latest"'::jsonb, 'App: URL de descarga del APK'),
  ('app_update_notes', '""'::jsonb,   'App: novedades de la actualización'),
  ('app_ota_version',  '""'::jsonb,   'App OTA (Capgo): versión del bundle web; vacío = sin OTA'),
  ('app_ota_url',      '""'::jsonb,   'App OTA (Capgo): URL del .zip del bundle web')
on conflict (key) do nothing;
