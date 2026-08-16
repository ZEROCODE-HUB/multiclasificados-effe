-- =====================================================================
-- 0104_privilegios_por_defecto.sql
--
-- Que las funciones NUEVAS nazcan cerradas. La 0103 lo intentó y no funcionó.
--
-- Qué falló en la 0103
-- --------------------
-- Traía esto, y parecía suficiente:
--
--   alter default privileges for role postgres in schema public
--     revoke execute on functions from public;
--
-- Se aplicó sin error, la fila de `pg_default_acl` quedó sin PUBLIC… y una
-- función creada después seguía naciendo con `=X/postgres`, o sea con EXECUTE
-- para PUBLIC. Comprobado creando una función de prueba y mirando su `proacl`.
--
-- El motivo está en `get_user_default_acl` de PostgreSQL: hay **dos** niveles de
-- privilegios por defecto —el GLOBAL (sin `in schema`) y el del ESQUEMA— y el
-- resultado es la UNIÓN de los dos. Cuando falta el global, PostgreSQL rellena
-- ese hueco con `acldefault()`, que para una función incluye a PUBLIC. Así que
-- tocar solo el del esquema no quita nada: el global lo vuelve a meter.
--
-- Lo que sí funciona son los dos, y en este orden de ideas:
--   · global  → quita a PUBLIC, que es quien arrastra a todos los roles futuros;
--   · esquema → quita a `anon` y `authenticated`, que Supabase concede
--     explícitamente ahí para que los RPC funcionen nada más crearlos.
--
-- Verificado después de aplicarlo: una función recién creada queda con
-- `postgres=X | service_role=X` y `has_function_privilege('anon', …)` en false.
--
-- ⚠️ CONSECUENCIA QUE HAY QUE RECORDAR
-- ------------------------------------
-- **Una función nueva que deba llamar el navegador necesita su `grant`
-- explícito**, o dará `42501 permission denied` en cuanto se use:
--
--   grant execute on function public.mi_funcion(...) to authenticated;   -- y anon si es pública
--
-- `service_role` se deja fuera de la revocación a propósito: las Edge Functions
-- entran con ese rol y no tendría sentido obligarlas a pedir permiso una por
-- una. Sigue heredando EXECUTE de la fila del esquema.
--
-- Esto NO toca ninguna función existente —los privilegios por defecto solo
-- valen para lo que se cree a partir de ahora—, así que no puede romper nada
-- que hoy funcione. Lo que ya estaba abierto se cerró en la 0103.
--
-- Y no cubre todo: una función creada por otro rol (por ejemplo desde el editor
-- SQL del panel con otro usuario) volvería a nacer abierta. El repaso está en
-- una consulta, y conviene correrla de vez en cuando:
--
--   select p.proname, pg_get_function_identity_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef
--      and (p.proacl is null
--           or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0));
--
-- Idempotente.
-- =====================================================================

do $$
begin
  -- Nivel global: sin esto, el del esquema no sirve de nada.
  execute format(
    'alter default privileges for role %I revoke execute on functions from public',
    current_user);

  -- Nivel del esquema: aquí es donde Supabase concede a anon y authenticated.
  execute format(
    'alter default privileges for role %I in schema public '
    'revoke execute on functions from public, anon, authenticated',
    current_user);

exception when others then
  -- Si el rol que aplica las migraciones no es el dueño, esto no se puede
  -- hacer desde aquí. Que se sepa, en vez de dar por hecha una protección que
  -- no está: es exactamente el error que cometió la 0103.
  raise warning 'NO se pudieron cerrar los privilegios por defecto (%). '
                'Las funciones nuevas seguirán naciendo abiertas a anon: '
                'revísalo con la consulta del encabezado.', sqlerrm;
end $$;
