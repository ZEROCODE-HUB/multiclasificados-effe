-- =====================================================================
-- 0047_matriz_moderador_soporte.sql — Matriz coherente para Moderador y Soporte.
--
-- La 0046 sembró filas sin pisar lo que ya había, y lo que ya había no cerraba:
--
--   * Soporte podía BORRAR avisos pero no editarlos. Un rol de solo lectura con
--     permiso de borrado es justo el permiso que no debería tener.
--   * Los dos veían "Configuración comercial" (precios, comisiones) y
--     "Auditoría y logs", que no son asunto suyo. Auditoría, además, vive en una
--     ruta de superadmin: la casilla prometía un acceso que no existe.
--
-- CRITERIO
--   Moderador — modera. Escribe en avisos, usuarios y denuncias. Verificar la
--   identidad de un usuario NO es moderar: eso queda en 'aprobar' de usuarios,
--   que no tiene. Nadie borra.
--   Soporte — acompaña. Ve lo que necesita para responder a un usuario
--   (incluidos Pagos y planes, para consultas de facturación) y no escribe nada.
--
-- Esto SOBREESCRIBE la matriz de esos dos roles: es una corrección puntual, no
-- una siembra. Los cambios que el superadmin haga después desde el panel se
-- conservan — la migración corre una vez.
-- No se toca 'admin'.
-- =====================================================================

begin;

insert into public.role_permissions (role, module, can_view, can_edit, can_approve, can_delete)
values
  -- Moderador
  ('moderador', 'Gestión de avisos',         true,  true,  true,  false),
  ('moderador', 'Gestión de usuarios',       true,  true,  false, false),
  ('moderador', 'Conversaciones reportadas', true,  true,  true,  false),
  ('moderador', 'Reportes',                  true,  false, false, false),
  ('moderador', 'Comunicaciones',            false, false, false, false),
  ('moderador', 'Pagos y planes',            false, false, false, false),
  ('moderador', 'Configuración comercial',   false, false, false, false),
  ('moderador', 'Auditoría y logs',          false, false, false, false),

  -- Soporte: solo lectura.
  ('soporte',   'Gestión de avisos',         true,  false, false, false),
  ('soporte',   'Gestión de usuarios',       true,  false, false, false),
  ('soporte',   'Conversaciones reportadas', true,  false, false, false),
  ('soporte',   'Reportes',                  true,  false, false, false),
  ('soporte',   'Pagos y planes',            true,  false, false, false),
  ('soporte',   'Comunicaciones',            false, false, false, false),
  ('soporte',   'Configuración comercial',   false, false, false, false),
  ('soporte',   'Auditoría y logs',          false, false, false, false)
on conflict (role, module) do update
set can_view    = excluded.can_view,
    can_edit    = excluded.can_edit,
    can_approve = excluded.can_approve,
    can_delete  = excluded.can_delete;

commit;
