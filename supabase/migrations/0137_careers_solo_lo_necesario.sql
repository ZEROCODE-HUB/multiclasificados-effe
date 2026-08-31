-- =====================================================================
-- 0137_careers_solo_lo_necesario.sql — cerrar lo que Supabase abre solo
--
-- LO QUE PASÓ, Y POR QUÉ NO LO VIO NINGUNA PRUEBA
--
-- La 0135 concede a mano lo justo:
--
--     grant insert          on public.careers to anon, authenticated;
--     grant select, update  on public.careers to authenticated;
--
-- y `migration0135.test.ts` comprueba que `anon` no puede leer ni borrar. Esa
-- prueba pasa en PGlite y **es falsa en producción**: el proyecto de Supabase
-- tiene `alter default privileges` que conceden ALL sobre cada tabla nueva del
-- esquema `public` a `anon` y `authenticated`. Un `grant` explícito no quita
-- nada; se suma a lo que ya venía dado.
--
-- Comprobado contra el proyecto real el 31-ago-2026, recién aplicada la 0135:
--
--     anon select = true · anon update = true · anon delete = true
--
-- Los datos NO estaban expuestos —la RLS hace su trabajo y una lectura anónima
-- devuelve cero filas—, pero la única barrera era la RLS. Y esta tabla guarda
-- documento, correo y teléfono de terceros: si alguien añade mañana una policy
-- permisiva de más, o toca `enable row level security`, no queda nada debajo.
--
-- Aquí se quita lo que sobra, para que los permisos digan lo que la 0135 quería
-- decir. Con esto hacen falta DOS errores, y no uno, para filtrar la tabla.
--
-- Y la lección, que vale para la próxima tabla: **PGlite no reproduce los
-- default privileges de Supabase**. Un `has_table_privilege` en verde ahí no
-- demuestra nada sobre producción; hay que revocar explícitamente y comprobarlo
-- contra el proyecto real.
--
-- Idempotente.
-- =====================================================================

-- Postular sí, todo lo demás no. Quien rellena el formulario público no tiene
-- por qué poder leer las postulaciones de otros ni cambiarlas.
revoke select, update, delete, truncate, references, trigger
  on public.careers from anon;

-- El personal lee y actualiza a través de las policies; borrar no lo hace
-- nadie desde la aplicación. Una postulación descartada se marca, no se
-- destruye: quien descarta hoy puede tener que explicar mañana por qué.
revoke delete, truncate on public.careers from authenticated;

comment on table public.careers is
  'B-18: postulaciones de "Trabaje con nosotros". NO confundir con `applications`, '
  'que son las postulaciones a los avisos de empleo de los anunciantes. '
  'Permisos: anon solo INSERT; authenticated SELECT/UPDATE por policy; nadie borra. '
  'Los revoke de la 0137 son necesarios: Supabase concede ALL por defecto a las '
  'tablas nuevas de `public`, y sin ellos la RLS sería la única barrera.';
