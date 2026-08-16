-- =====================================================================
-- 0103_rpc_solo_para_quien_debe.sql
--
-- Cerrar los RPC internos que cualquiera podía llamar desde internet.
--
-- El problema, y por qué no se veía
-- ---------------------------------
-- En PostgreSQL, una función nace con **EXECUTE para PUBLIC**. Si nadie lo
-- revoca, PUBLIC incluye a `anon`, y `anon` es la llave que va dentro del
-- bundle del navegador: pública por definición. PostgREST expone cada función
-- del esquema `public` como `POST /rest/v1/rpc/<nombre>`. Resultado: 69
-- funciones `SECURITY DEFINER` eran invocables por cualquiera sin sesión.
--
-- La mayoría no importa: llevan su guarda dentro (`has_perm`, `is_staff`) y
-- responden vacío a quien no debe. Las de aquí abajo **no tenían ninguna**,
-- porque nunca se pensaron para un cliente. Comprobado contra producción antes
-- de escribir esto:
--
--   POST /rest/v1/rpc/invoice_worker_secret   →  devolvió el secreto del worker
--   POST /rest/v1/rpc/notify_user             →  llegó hasta el INSERT (falló
--                                                solo por la clave foránea)
--
-- Y `listings.owner_id` sí es legible sin sesión, así que sacar la lista de
-- anunciantes y meterles a todos una notificación falsa era cuestión de un
-- bucle. Lo más grave a futuro es `next_invoice_number`: quemar correlativos
-- deja huecos en la numeración de SUNAT, y un hueco hay que justificarlo.
--
-- La regla que se aplica
-- ----------------------
-- Una función solo conserva EXECUTE si alguien la llama de verdad:
--   · el navegador (54 RPC, listadas con un grep de `supabase.rpc(...)`);
--   · una Edge Function, que entra con `service_role` y necesita el permiso
--     explícito, porque al revocar de PUBLIC lo pierde también;
--   · una política RLS.
-- Todo lo demás —disparadores, cron, y las que solo llaman otras funciones
-- `SECURITY DEFINER`— no necesita nada: se ejecutan como su dueño.
--
-- Lo que NO se toca, y conviene saber por qué
-- -------------------------------------------
-- `has_perm`, `is_staff` y `has_role` se quedan como están: hay **5 políticas
-- RLS** que las invocan (categories, subcategories, pricing_settings,
-- promotions, invoice_emission_attempts) y una política se evalúa con los
-- permisos de quien consulta. Revocarlas rompería el panel entero.
--
-- Antes de escribir esto se verificó que ninguna de las funciones de abajo
-- aparece en una política RLS, en un DEFAULT de columna, en una vista ni en
-- una restricción. La consulta está en la skill de diagnóstico.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Facturación ----------
-- El secreto del worker. Con él se maneja `emit-invoice` desde fuera.
revoke execute on function public.invoice_worker_secret()
  from public, anon, authenticated;

-- Los correlativos. Quemarlos deja huecos en la serie ante SUNAT.
revoke execute on function public.next_invoice_number(public.invoice_type)
  from public, anon, authenticated;
revoke execute on function public.next_invoice_number(public.invoice_type, boolean)
  from public, anon, authenticated;

-- Despertar al worker. Lo llaman `settle_paid_order`, `anular_comprobante`,
-- el barrido y un disparador — todos SECURITY DEFINER, todos como dueño.
revoke execute on function public.dispatch_invoice_emission(uuid)
  from public, anon, authenticated;

revoke execute on function public.invoice_emission_enabled()
  from public, anon, authenticated;

-- ---------- 2. Avisos a usuarios ----------
-- Escribía en la campana de CUALQUIER usuario, con el texto que se quisiera.
-- La llaman los disparadores y las funciones de moderación, que corren como
-- dueño y no necesitan este permiso.
revoke execute on function public.notify_user(uuid, text, text, jsonb)
  from public, anon, authenticated;

-- ---------- 3. Los cron ----------
-- pg_cron los ejecuta como postgres. Nadie más tiene por qué dispararlos:
-- `run_saved_search_alerts` manda notificaciones y correos.
revoke execute on function public.run_saved_search_alerts()
  from public, anon, authenticated;
revoke execute on function public.expire_listings()
  from public, anon, authenticated;

-- ---------- 4. Bitácora ----------
-- Tiene guarda (`is_staff`), pero registrar auditoría es cosa de las funciones
-- de administración, no de un cliente.
revoke execute on function public.log_audit(text, text, text, jsonb)
  from public, anon, authenticated;

-- ---------- 5. Precios ----------
-- El navegador nunca los llama: publica con `publish_listing`, que calcula el
-- costo por dentro. `effe_listing_cost` sí la llama `create-payment` para
-- cobrar lo que falta al publicar, y entra con service_role.
revoke execute on function public.effe_pricing()
  from public, anon, authenticated;
revoke execute on function public.effe_promo_pct(text)
  from public, anon, authenticated;
revoke execute on function public.effe_listing_cost(uuid, int)
  from public, anon, authenticated;
grant  execute on function public.effe_listing_cost(uuid, int) to service_role;

-- ---------- 6. Funciones de disparador ----------
-- Solo tienen sentido colgadas de un INSERT/UPDATE. Llamarlas a mano da error
-- («trigger functions can only be called as triggers»), pero no hay razón para
-- que estén ofrecidas en la API.
--
-- Quitarles el permiso NO desactiva ningún disparador: PostgreSQL comprueba el
-- EXECUTE al CREAR el trigger, no cada vez que se dispara.
revoke execute on function public.handle_new_user()            from public, anon, authenticated;
revoke execute on function public.on_new_message()             from public, anon, authenticated;
revoke execute on function public.on_new_application()         from public, anon, authenticated;
revoke execute on function public.on_application_status()      from public, anon, authenticated;
revoke execute on function public.on_new_review()              from public, anon, authenticated;
revoke execute on function public.on_notification_email()      from public, anon, authenticated;
revoke execute on function public.on_notification_push()       from public, anon, authenticated;
revoke execute on function public.on_invoice_dispatch()        from public, anon, authenticated;
revoke execute on function public.recalc_user_rating()         from public, anon, authenticated;
revoke execute on function public.enforce_review_eligibility() from public, anon, authenticated;

-- ---------- 7. Que las próximas nazcan cerradas ----------
-- La causa de fondo es el valor por defecto de PostgreSQL, y ya mordió antes:
-- `add_credits` (0071) permitía regalarse saldo sin pagar, y `settle_paid_order`
-- tuvo lo mismo. Esto no cambia el pasado, pero hace que cualquier función
-- nueva creada por el dueño del esquema nazca sin EXECUTE para PUBLIC.
--
-- Va en un bloque tolerante: si el rol no coincide con el dueño real de las
-- migraciones, el resto ya quedó aplicado.
do $$
begin
  execute format(
    'alter default privileges for role %I in schema public revoke execute on functions from public',
    current_user);
exception when others then
  raise notice 'No se pudieron fijar los privilegios por defecto: %', sqlerrm;
end $$;
