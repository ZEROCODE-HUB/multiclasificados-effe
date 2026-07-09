-- =====================================================================
-- 0043_consolidate_anunciante_role.sql — consolida 'anunciante' en 'buscador'
--
-- No había separación real de permisos entre ambos roles: RequireRole les
-- asigna el mismo rango, y todo usuario 'buscador' ya podía publicar avisos.
-- Mantener los dos solo generaba ruido al filtrar en el panel de usuarios.
--
-- El valor 'anunciante' NO se elimina del enum public.app_role: las rutas
-- (/dashboard/anunciante), el redirect de login y la audiencia de
-- comunicaciones todavía lo referencian. Simplemente deja de asignarse.
--
-- Idempotente: si no quedan filas 'anunciante', no hace nada.
-- =====================================================================

begin;

-- 1) Usuarios que tienen AMBOS roles: la fila 'anunciante' sobra. No se puede
--    reetiquetar porque chocaría con la PK (user_id, role) de la fila 'buscador'.
delete from public.user_roles ur
where ur.role = 'anunciante'
  and exists (
    select 1 from public.user_roles b
    where b.user_id = ur.user_id and b.role = 'buscador'
  );

-- 2) Los que solo tenían 'anunciante': se reetiquetan a 'buscador'.
update public.user_roles
set role = 'buscador'
where role = 'anunciante';

commit;

-- Verificación (debe devolver 0):
--   select count(*) from public.user_roles where role = 'anunciante';
