-- =====================================================================
-- 0138_privilegios_que_sobran.sql — cerrar lo que Supabase abre solo (II)
--
-- Continuación de la 0137, que hizo esto mismo con `careers`. Salió al revisar
-- el flujo de reportes el 1-sep-2026: Supabase tiene `alter default privileges`
-- que conceden ALL sobre cada tabla nueva de `public` a `anon` y
-- `authenticated`, y **34 de las 35 tablas del esquema lo arrastran**. Un
-- `grant` explícito no quita nada; se suma a lo que ya venía dado.
--
-- Aquí se cierran las DOS que no pueden esperar. El resto queda anotado abajo.
--
-- ---------------------------------------------------------------------
-- 1. `invoice_series` — la que de verdad estaba abierta
--
-- Es el correlativo de boletas y facturas, y es la ÚNICA tabla de `public`
-- **sin RLS**. Comprobado contra producción:
--
--     anon: select = true · insert = true · update = true · delete = true
--
-- Sin RLS debajo, eso no es un segundo cinturón que falta: es la puerta. Con la
-- llave anónima —que viaja en el paquete de la web y la ve cualquiera— se podía
-- leer el correlativo, retrocederlo o borrar la fila. Retroceder el correlativo
-- de una serie ya declarada a SUNAT significa emitir números repetidos, y eso
-- no se arregla con un despliegue.
--
-- Nadie fuera de la base la toca: `next_invoice_number` y
-- `next_credit_note_number` son SECURITY DEFINER y son de `postgres`, así que
-- siguen funcionando igual sin estos permisos. Verificado antes de revocar.
--
-- ---------------------------------------------------------------------
-- 2. `reports` — porque desde la 0136 guarda documentos de terceros
--
-- La RLS sí está y hace su trabajo (`reports_select_staff`), así que los datos
-- no estaban expuestos. Pero la 0136 metió ahí `reporter_name` y
-- `reporter_doc_number`: nombre y DNI de quien denuncia. Que la única barrera
-- sobre eso sea una policy es poco. Con esto hacen falta dos errores, y no uno.
--
-- Lo que se conserva es exactamente lo que usa la aplicación: INSERT para poder
-- denunciar, y SELECT/UPDATE de `authenticated` porque el panel de moderación
-- va por policy. Borrar no lo hace nadie: una denuncia se resuelve, no se
-- destruye — quien la cierra hoy puede tener que explicar mañana por qué.
--
-- ---------------------------------------------------------------------
-- LO QUE QUEDA (decisión pendiente, no olvido)
--
-- Las otras 32 tablas siguen con los privilegios por defecto. Todas tienen RLS,
-- así que hoy no hay nada expuesto, pero tampoco hay segunda capa. Repasarlas
-- una a una es trabajo aparte: un revoke de más en `listings` o `profiles`
-- apaga la web pública, así que no se hace en bloque ni a ciegas.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. El correlativo de SUNAT ----------
revoke all on public.invoice_series from anon, authenticated;

comment on table public.invoice_series is
  'Correlativo de boletas, facturas y notas de crédito. NO tiene RLS a propósito: '
  'no se toca nunca desde el cliente, solo desde next_invoice_number y '
  'next_credit_note_number, que son SECURITY DEFINER. Por eso la 0138 revoca todo '
  'a anon y authenticated: sin RLS, los grants por defecto de Supabase eran la '
  'única puerta y estaba abierta.';

-- ---------- 2. Los reportes, que ahora llevan DNI ----------
revoke all on public.reports from anon, authenticated;

-- Denunciar exige sesión: la policy `reports_insert_auth` pide
-- `auth.uid() is not null`, así que el INSERT de `anon` que había concedido
-- Supabase no servía para nada — no se vuelve a dar.
grant insert on public.reports to authenticated;
-- Moderar, y ver lo denunciado por uno mismo: pasan por `reports_select_staff`
-- y `reports_update_staff`.
grant select, update on public.reports to authenticated;

comment on table public.reports is
  'Denuncias de avisos y usuarios. Desde la 0136 guarda nombre y documento de '
  'quien reporta (B-10), por eso la 0138 deja solo lo necesario: INSERT para '
  'denunciar, SELECT/UPDATE por policy para moderar, y nadie borra.';
