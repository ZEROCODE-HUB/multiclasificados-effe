-- =====================================================================
-- 0145_postular_sin_poder_leer_a_los_demas.sql
--
-- LO QUE REPORTÓ EL CLIENTE, desde /trabaje-con-nosotros:
--
--     new row violates row-level security policy for table "careers"
--     No se pudo registrar tu postulación
--
-- El formulario público de "Trabaje con nosotros" NO FUNCIONA. Y no funciona
-- para nadie: la tabla tiene 0 filas.
--
-- ── POR QUÉ ──────────────────────────────────────────────────────────
--
-- `submitCareer` hace un insert con `.select("code, created_at")`, es decir un
-- INSERT ... RETURNING. Y para devolver la fila recién creada hace falta poder
-- LEERLA, que es justo lo que esta tabla no permite: guarda documento, correo y
-- teléfono de terceros, así que solo el personal puede consultarla.
--
-- Salen dos errores distintos según quién rellene el formulario, y por eso
-- costaba reconocerlo como un solo fallo (los dos reproducidos en producción):
--
--   · sin sesión   → 42501 «permission denied for table careers»
--                    La 0137 le quitó el SELECT a `anon` el 31-ago.
--   · con sesión   → 42501 «new row violates row-level security policy»
--                    `authenticated` sí tiene el privilegio, pero la policy de
--                    lectura pide `has_perm('Trabaje con nosotros','view')`.
--                    Postgres aplica las policies de SELECT al RETURNING como
--                    si fueran WITH CHECK, y de ahí ese mensaje.
--
-- Es el reverso de la 0137. Aquella cerró la tabla —con razón, y su cabecera
-- explica muy bien por qué— pero nadie volvió a mirar quién leía. La misma
-- avería de siempre: se cambia una cosa y se queda vivo el que dependía de ella.
--
-- Ninguna prueba lo vio porque PGlite no reproduce los privilegios por defecto
-- de Supabase; la propia 0137 lo deja escrito. Con `set role`, sí se ve.
--
-- ── CÓMO SE ARREGLA, Y CÓMO NO ───────────────────────────────────────
--
-- NO abriendo el SELECT. Sin una columna de propietario no hay forma de acotar
-- la lectura a "tu propia postulación" —quien postula puede no tener cuenta—,
-- así que cualquier policy de lectura para `anon` dejaría los datos personales
-- de todos los candidatos al alcance de cualquiera. Sería deshacer la 0137.
--
-- Se hace al revés: una función `security definer` que inserta y devuelve SOLO
-- el número y la fecha. La tabla sigue cerrada, y quien postula recibe su
-- referencia —que es lo único que necesita— sin poder leer ni una fila.
--
-- Idempotente.
-- =====================================================================

create or replace function public.postular_a_la_empresa(
  p_apellido_paterno text,
  p_apellido_materno text,
  p_nombres          text,
  p_doc_type         text,
  p_doc_number       text,
  p_email            text,
  p_phone            text,
  p_grado            text,
  p_puesto           text,
  p_descripcion      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_code bigint;
  v_creado timestamptz;
begin
  -- Se recorta aquí y no solo en el navegador: esta función es ahora la puerta
  -- de entrada, y un espacio en blanco cuenta como texto para un `not null`.
  if btrim(coalesce(p_apellido_paterno, '')) = ''
     or btrim(coalesce(p_apellido_materno, '')) = ''
     or btrim(coalesce(p_nombres, '')) = ''
     or btrim(coalesce(p_doc_number, '')) = ''
     or btrim(coalesce(p_email, '')) = ''
     or btrim(coalesce(p_grado, '')) = ''
     or btrim(coalesce(p_puesto, '')) = ''
     or btrim(coalesce(p_descripcion, '')) = '' then
    raise exception 'Faltan datos obligatorios en la postulación' using errcode = 'EF021';
  end if;

  -- El trigger `careers_frenar` (0135) sigue mandando: si alguien repite, lanza
  -- `check_violation` con un texto ya redactado para quien postula. No se
  -- captura a propósito — sube tal cual para que la pantalla lo enseñe como
  -- "Ya tenemos tu postulación" y no como un error inesperado.
  insert into public.careers (
    apellido_paterno, apellido_materno, nombres,
    doc_type, doc_number, email, phone, grado, puesto, descripcion
  ) values (
    btrim(p_apellido_paterno), btrim(p_apellido_materno), btrim(p_nombres),
    coalesce(nullif(btrim(p_doc_type), ''), 'DNI'), btrim(p_doc_number),
    lower(btrim(p_email)), nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_grado), btrim(p_puesto), btrim(p_descripcion)
  )
  returning code, created_at into v_code, v_creado;

  -- SOLO esto. El resto de la fila no vuelve a salir de la base: quien postula
  -- ya sabe lo que escribió, y lo demás son datos de otros.
  return jsonb_build_object('code', v_code, 'created_at', v_creado);
end;
$function$;

-- Por la 0104 una función nace SIN execute. El formulario es público —exigir
-- cuenta para dejar un currículum pierde a la mitad de los candidatos en la
-- puerta—, así que `anon` tiene que poder llamarla.
revoke all     on function public.postular_a_la_empresa(text, text, text, text, text, text, text, text, text, text) from public;
grant  execute on function public.postular_a_la_empresa(text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

comment on function public.postular_a_la_empresa(text, text, text, text, text, text, text, text, text, text) is
  'Registra una postulación de "Trabaje con nosotros" y devuelve SOLO su número '
  'y su fecha. Existe porque la tabla no se puede leer (guarda datos personales '
  'de terceros) y un INSERT ... RETURNING necesitaba poder leerla: ese era el '
  'fallo que dejó el formulario público inservible entre la 0137 y la 0145.';
