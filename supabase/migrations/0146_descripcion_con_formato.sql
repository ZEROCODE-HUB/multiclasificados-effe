-- =====================================================================
-- 0146_descripcion_con_formato.sql
--
-- Negrita y color en la descripción del aviso.
--
-- ── POR QUÉ EL FORMATO NO VA DENTRO DE `description` ─────────────────
--
-- Porque esa columna la leen CINCO consumidores y solo uno de ellos quiere ver
-- el formato:
--
--   · el buscador, con `to_tsvector('spanish', title || description)` Y ADEMÁS
--     `description ilike '%q%'` — si dentro hubiera marcado, se indexarían las
--     etiquetas, y buscar «casa» dejaría de encontrar un aviso donde la palabra
--     estuviera partida por una marca de negrita;
--   · la vista previa de WhatsApp y Facebook (`api/og-aviso.ts`), que recorta la
--     descripción a 200 caracteres y la mete en una meta;
--   · la tarjeta del listado, con dos líneas recortadas;
--   · el contador de 2000 caracteres del formulario, que cuenta lo que la
--     persona escribió y no lo que ocupan las marcas;
--   · la ficha del aviso, que es el ÚNICO que quiere el formato.
--
-- Así que `description` sigue siendo TEXTO PLANO, exactamente como hasta hoy, y
-- el formato vive aparte. Cuatro de los cinco no se enteran de nada.
--
-- ── Y POR QUÉ NO SE GUARDA HTML ──────────────────────────────────────
--
-- Guardar HTML de usuarios obliga a sanearlo, y un solo fallo en el saneado es
-- XSS almacenado servido a todos los visitantes, para siempre. Aquí se guarda
-- una ESTRUCTURA: fragmentos de texto con dos marcas opcionales.
--
--     [{"t":"Depa "}, {"t":"amoblado","b":true}, {"t":" en Miraflores","c":"rojo"}]
--
-- El renderizador construye elementos de React a partir de eso y NUNCA usa
-- `dangerouslySetInnerHTML`, así que un anunciante no puede producir una
-- etiqueta ni queriendo. Es seguro por construcción y no por vigilancia. Hoy la
-- aplicación no pinta HTML de usuarios en ninguna parte; esto lo mantiene.
--
-- ── LAS DOS NUNCA PUEDEN DISCREPAR ───────────────────────────────────
--
-- Un trigger DERIVA `description` del contenido con formato. No se confía en
-- que el cliente mande las dos versiones coherentes: lo que se busca es siempre,
-- por construcción, lo que se ve. Es el mismo principio que arregló los ingresos
-- en la 0142 — una sola definición, no dos copias que se separan con el tiempo.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. La columna ----------
alter table public.listings
  add column if not exists description_rich jsonb;

comment on column public.listings.description_rich is
  'Descripción con formato: array de fragmentos {t: texto, b: negrita?, c: color?}. '
  'NULL = sin formato, se usa `description` tal cual. NUNCA se pinta como HTML: '
  'el renderizador construye elementos a partir de la estructura. `description` '
  'se deriva de aquí por trigger, así que el buscador y la vista previa de '
  'WhatsApp siguen viendo texto plano.';

-- ---------- 2. Qué es válido ----------
-- IMMUTABLE porque solo mira su argumento: es lo que exige un CHECK, y aquí es
-- verdad, no una etiqueta puesta para que pase.
create or replace function public.texto_con_formato_valido(p jsonb)
returns boolean
language sql
immutable
as $function$
  select case
    when p is null then true
    when jsonb_typeof(p) <> 'array' then false
    -- Un tope de fragmentos: sin él, 2000 caracteres podrían llegar partidos en
    -- 2000 nodos y cada ficha pintaría 2000 elementos. 300 permite un aviso muy
    -- trabajado y corta el abuso.
    when jsonb_array_length(p) = 0 or jsonb_array_length(p) > 300 then false
    else not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'object'
         -- Solo las tres claves conocidas. Cualquier otra cosa es basura o un
         -- intento de colar algo que el renderizador de mañana podría mirar.
         or exists (select 1 from jsonb_object_keys(e) k where k not in ('t','b','c'))
         or coalesce(jsonb_typeof(e->'t'), 'null') <> 'string'
         or (e ? 'b' and e->'b' <> 'true'::jsonb)
         -- El color es de la paleta o no es. Un hexadecimal libre acaba en
         -- amarillo sobre blanco, que no se lee.
         or (e ? 'c' and coalesce(e->>'c', '') not in ('azul','naranja','verde','rojo'))
    )
  end;
$function$;

comment on function public.texto_con_formato_valido(jsonb) is
  'Valida la estructura de `listings.description_rich`. Se comprueba en la BASE '
  'y no solo en el navegador porque cualquiera con la llave anónima puede '
  'escribir en sus propios avisos: la RLS dice QUIÉN escribe, no QUÉ.';

alter table public.listings
  drop constraint if exists listings_description_rich_check;
alter table public.listings
  add constraint listings_description_rich_check
  check (public.texto_con_formato_valido(description_rich));

-- ---------- 3. El texto plano se deriva, no se confía ----------
create or replace function public.texto_plano_del_formato(p jsonb)
returns text
language sql
immutable
as $function$
  -- El guardia no sobra: esta función corre en el trigger, que se ejecuta ANTES
  -- que el CHECK. Sin él, un valor que no sea una lista revienta con un
  -- "cannot extract elements from a scalar" de Postgres en vez de un mensaje
  -- que alguien pueda entender.
  select case when p is null or jsonb_typeof(p) <> 'array' then ''
    else coalesce((
      select string_agg(e->>'t', '' order by ord)
        from jsonb_array_elements(p) with ordinality as x(e, ord)
    ), '')
  end;
$function$;

create or replace function public.sincronizar_descripcion()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_plano text;
begin
  if new.description_rich is null then
    return new;
  end if;

  -- Se valida AQUÍ y no solo con el CHECK para dar un mensaje legible: el error
  -- de una restricción llega al navegador como un texto de Postgres. El CHECK
  -- se queda igualmente como segunda barrera, por si algún día se tocara este
  -- trigger.
  if not public.texto_con_formato_valido(new.description_rich) then
    raise exception 'El formato de la descripción no es válido' using errcode = 'EF021';
  end if;

  v_plano := public.texto_plano_del_formato(new.description_rich);

  -- Un formato que no aporta texto no es formato. Se descarta en vez de dejar
  -- una descripción vacía con adornos.
  if btrim(v_plano) = '' then
    new.description_rich := null;
    return new;
  end if;

  -- El MISMO tope que el formulario. Se comprueba sobre el texto y no sobre el
  -- JSON: lo que se limita es lo que la persona escribió.
  if length(v_plano) > 2000 then
    raise exception 'La descripción no puede pasar de 2000 caracteres' using errcode = 'EF021';
  end if;

  new.description := v_plano;
  return new;
end;
$function$;

drop trigger if exists listings_sincronizar_descripcion on public.listings;
create trigger listings_sincronizar_descripcion
  before insert or update of description, description_rich on public.listings
  for each row execute function public.sincronizar_descripcion();

comment on function public.sincronizar_descripcion() is
  'Deriva `description` del contenido con formato. Existe para que el buscador '
  'y la vista previa de WhatsApp NO puedan enseñar algo distinto de lo que se '
  've en la ficha: una sola fuente, no dos copias que se separan.';

-- ---------- 4. Que la ficha pueda leerlo ----------
-- `create or replace` y NO `drop + create`: añadir una columna AL FINAL sí lo
-- admite, y así la vista conserva sus permisos. Un DROP los perdería y el
-- buscador entero devolvería vacío hasta que alguien se acordara del grant
-- (es lo que costó la 0136).
create or replace view public.listing_cards as
  select
    l.id, l.owner_id, l.title, l.description, l.price, l.currency, l.condition,
    l.category_id, l.subcategory_id, l.location, l.lat, l.lng, l.status,
    l.featured, l.urgent, l.confidential, l.views, l.published_at, l.created_at,
    l.expires_at,
    p.full_name as advertiser,
    p.rating as advertiser_rating,
    (select li.url from public.listing_images li
      where li.listing_id = l.id order by li.sort_order limit 1) as image_url,
    l.department,
    coalesce(p.verified, false) as advertiser_verified,
    coalesce(l.country, 'PE'::text) as country,
    ((select count(*) from public.listing_videos v where v.listing_id = l.id))::integer as video_count,
    -- La columna nueva va AL FINAL, que es la única forma de que
    -- `create or replace view` la acepte.
    l.description_rich
  from public.listings l
    join public.profiles p on p.id = l.owner_id
  where l.status = 'active'::listing_status;
