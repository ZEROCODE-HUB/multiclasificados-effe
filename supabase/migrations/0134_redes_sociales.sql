-- =====================================================================
-- 0134_redes_sociales.sql — punto B-16 de la auditoría
--
-- «En la parte final de la página, colocar los iconos de las diversas redes
--  sociales: Facebook, Instagram, TikTok, YouTube, LinkedIn, WhatsApp, este
--  último se conectará al número +51 903 375 308.»
--
-- POR QUÉ EN LA BASE Y NO EN EL CÓDIGO
--
-- Una cuenta de red social cambia de nombre, se abre una nueva o se cierra la
-- vieja, y eso no debería costar un despliegue. Van en `system_settings`, que
-- es donde ya viven el modo mantenimiento y la comisión, y se editan desde
-- Comercial → Variables del sistema.
--
-- POR QUÉ HACE FALTA UNA FUNCIÓN Y NO VALE `get_settings()`
--
-- `system_settings` tiene RLS y `get_settings()` solo responde al personal. El
-- pie de la portada lo ve **todo el mundo**, con sesión y sin ella. Es el mismo
-- caso que `is_maintenance_mode()` (migración 0045): una función `security
-- definer` que expone SOLO las claves que pueden ser públicas.
--
-- La lista de claves está escrita a mano aquí dentro **a propósito**. Una
-- función genérica del tipo `get_public_setting(key)` sería más cómoda y mucho
-- peor: el día que alguien guarde un secreto en `system_settings` —ya hay uno,
-- `payment_worker_secret`— quedaría al alcance de cualquiera con la anon key,
-- que es pública. Aquí, para filtrar algo hay que añadirlo a mano a esta lista.
--
-- El saneado del valor (que sea https, que no sea `javascript:`) se hace además
-- en el front, antes de pintarlo. Aquí solo se devuelve lo que hay.
--
-- Idempotente.
-- =====================================================================

create or replace function public.redes_sociales()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(
      -- Se devuelve sin el prefijo `social_`: quien la consume pide
      -- `facebook`, no `social_facebook`.
      substring(s.key from 8),
      -- El valor se guarda como jsonb string; `#>> '{}'` lo saca como texto
      -- plano. Sin esto llegaría entrecomillado y el href saldría roto.
      nullif(btrim(s.value #>> '{}'), '')
    ),
    '{}'::jsonb
  )
  from public.system_settings s
  where s.key in (
    'social_facebook',
    'social_instagram',
    'social_tiktok',
    'social_youtube',
    'social_linkedin',
    'social_whatsapp'
  );
$$;

-- Desde la 0104 una función nueva nace SIN execute para anon/authenticated. Sin
-- estas dos líneas el pie sale sin iconos y sin decir por qué: un 42501 que el
-- `catch` del front se traga. Ya pasó una vez y dejó el buscador a cero.
revoke execute on function public.redes_sociales() from public;
grant  execute on function public.redes_sociales() to anon, authenticated;

comment on function public.redes_sociales() is
  'B-16: enlaces de redes sociales del pie, legibles sin sesión. Expone solo las '
  'seis claves social_* escritas a mano en su cuerpo — no generalizar a '
  'get_public_setting(key), que dejaría al alcance de la anon key cualquier '
  'secreto guardado en system_settings.';

-- Las filas, con su etiqueta, para que aparezcan en el panel aunque estén
-- vacías: si no existen, el administrador no tiene dónde escribirlas.
-- `do nothing`: si ya hay un enlace puesto, un despliegue no lo borra.
insert into public.system_settings (key, value, label) values
  ('social_facebook',  '""'::jsonb, 'Facebook (URL del perfil)'),
  ('social_instagram', '""'::jsonb, 'Instagram (URL del perfil)'),
  ('social_tiktok',    '""'::jsonb, 'TikTok (URL del perfil)'),
  ('social_youtube',   '""'::jsonb, 'YouTube (URL del canal)'),
  ('social_linkedin',  '""'::jsonb, 'LinkedIn (URL de la página)'),
  ('social_whatsapp',  '""'::jsonb, 'WhatsApp (número, ej. 51903375308)')
on conflict (key) do nothing;
