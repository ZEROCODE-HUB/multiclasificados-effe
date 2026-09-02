-- =====================================================================
-- 0141_acerca_de_nosotros.sql — la sección «Acerca de Nosotros», editable
--
-- «Poner en el final una sección llamada: Acerca de Nosotros y que sea editable
--  desde el admin.»
--
-- CONTEXTO, PORQUE ESTO YA EXISTIÓ Y SE QUITÓ
--
-- El pie tenía un enlace "Acerca de" que era un ancla a la propia portada y no
-- llevaba a ningún contenido. Se retiró en la iteración 3 (IT3-010) junto con
-- otros dos enlaces que tampoco iban a ninguna parte. Ahora vuelve, pero con
-- texto de verdad y con quien escribe ese texto pudiendo cambiarlo.
--
-- POR QUÉ EN LA BASE Y NO EN EL CÓDIGO
--
-- Es exactamente el mismo caso que las redes sociales (0134): un texto de
-- empresa se retoca —cambia una cifra, se añade una línea— y eso no puede
-- costar un despliegue cada vez.
--
-- POR QUÉ UNA FUNCIÓN PROPIA Y NO `get_settings()`
--
-- `system_settings` tiene RLS y `get_settings()` solo responde al personal. Esta
-- sección la ve TODO EL MUNDO, con sesión y sin ella.
--
-- Y por qué no una `get_public_setting(key)` genérica, que sería más cómoda: en
-- `system_settings` hay secretos —`payment_worker_secret`— y una función así los
-- dejaría al alcance de cualquiera con la anon key, que viaja en el paquete de
-- la web. Las claves van escritas a mano aquí dentro, igual que en la 0134: para
-- filtrar algo hay que añadirlo a esta lista a propósito.
--
-- EL TEXTO SE PINTA COMO TEXTO, NUNCA COMO HTML
--
-- Lo escribe una persona en un campo del panel y lo lee todo el visitante. Si
-- se pintara como HTML, un administrador despistado que pegue algo que le
-- pasaron estaría metiendo un <script> en la portada. El front lo pinta con
-- `whitespace-pre-line`: respeta los saltos de línea y nada más.
--
-- Idempotente.
-- =====================================================================

create or replace function public.acerca_de()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(
      -- Sin el prefijo `about_`: quien la consume pide `titulo`, no
      -- `about_titulo`.
      substring(s.key from 7),
      -- `#>> '{}'` saca el texto plano del jsonb string. Sin esto llegaría
      -- entrecomillado y se pintarían las comillas en la portada.
      nullif(btrim(s.value #>> '{}'), '')
    ),
    '{}'::jsonb
  )
  from public.system_settings s
  where s.key in (
    'about_titulo',
    'about_texto',
    'about_mision',
    'about_vision'
  );
$$;

-- Desde la 0104 una función nueva nace SIN execute para anon/authenticated. Sin
-- estas dos líneas la sección sale vacía y sin decir por qué: un 42501 que el
-- `catch` del front se traga. Ya pasó una vez y dejó el buscador a cero.
revoke execute on function public.acerca_de() from public;
grant  execute on function public.acerca_de() to anon, authenticated;

comment on function public.acerca_de() is
  'Texto de la sección "Acerca de Nosotros" de la portada y de /acerca-de, '
  'legible sin sesión. Expone solo las cuatro claves about_* escritas a mano en '
  'su cuerpo — no generalizar a get_public_setting(key), que dejaría al alcance '
  'de la anon key cualquier secreto guardado en system_settings.';

-- Las filas, con su etiqueta, para que aparezcan en el panel aunque estén
-- vacías: si no existen, el administrador no tiene dónde escribirlas.
--
-- Nacen CON UN TEXTO DE PARTIDA, y no en blanco a propósito: una sección nueva
-- que se despliega vacía se ve rota, y el cliente tendría que entrar a rellenarla
-- antes de que la portada vuelva a estar presentable. Con esto ya dice algo
-- razonable desde el primer minuto y se retoca cuando se pueda. El texto sale
-- del que ya estaba escrito en el pie de la portada.
--
-- `do nothing`: si ya hay algo escrito, un despliegue no lo pisa.
insert into public.system_settings (key, value, label) values
  ('about_titulo', '"Acerca de Nosotros"'::jsonb,
   'Acerca de Nosotros · Título'),
  ('about_texto',
   to_jsonb('eFFe Multiclasificados es la plataforma peruana de avisos clasificados donde encuentras y publicas inmuebles, vehículos, empleos y servicios.

Nacimos para que anunciar sea simple y seguro: un aviso bien hecho, visible desde cualquier lugar del país y con las herramientas para conversar directamente con quien te interesa. Verificamos a los anunciantes, moderamos lo que se publica y acompañamos cada operación con su comprobante.'::text),
   'Acerca de Nosotros · Texto'),
  ('about_mision',
   to_jsonb('Conectar a las personas y los negocios del Perú con quien los está buscando, de manera simple, segura y profesional.'::text),
   'Acerca de Nosotros · Misión'),
  ('about_vision',
   to_jsonb('Ser el lugar al que todo el Perú acude cuando quiere comprar, vender, alquilar, contratar o encontrar trabajo.'::text),
   'Acerca de Nosotros · Visión')
on conflict (key) do nothing;
