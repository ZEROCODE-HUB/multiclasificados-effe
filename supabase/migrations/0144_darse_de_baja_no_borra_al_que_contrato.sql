-- =====================================================================
-- 0144_darse_de_baja_no_borra_al_que_contrato.sql
--
-- LO QUE REPORTÓ EL CLIENTE: "con el rol de usuario final he ELIMINADO una
-- cuenta, y al parecer lo hizo totalmente, no lo encuentro como INACTIVO, y
-- todos los avisos relacionados con ese cliente ya no son parte de las
-- estadísticas del Dashboard, ni en cantidad de avisos, tampoco en dinero que
-- ingresó. Tenía avisos activos, vencidos y un historial que no se debe perder."
--
-- Y es exactamente lo que pasó. La regla de la 0127 —a quien ya contrató no se
-- le borra, porque SUNAT o el Poder Judicial pueden pedir la relación de
-- clientes— se puso SOLO en el botón del panel. La opción de "Eliminar cuenta"
-- que el usuario tiene en Configuraciones sigue llamando a delete_my_account,
-- que es de la 0053 y hace un "delete from auth.users" a secas.
--
-- Es la misma avería de siempre: se añade una forma nueva de hacer algo y nadie
-- vuelve a mirar quién hacía lo viejo. Aquí duele más porque el camino sin
-- protección es el que está abierto al público.
--
-- ── QUÉ SE LLEVÓ POR DELANTE ─────────────────────────────────────────
--
-- Las claves foráneas que salen de `profiles` están en CASCADE: avisos,
-- órdenes, movimientos de saldo, favoritos, mensajes, reseñas, postulaciones.
-- Y como `invoices.order_id` también es CASCADE, al irse las órdenes se van las
-- BOLETAS. Comprobantes ya declarados ante SUNAT, borrados desde la pantalla de
-- ajustes de un usuario cualquiera. Eso es justo lo que la 0127 vino a impedir.
--
-- Por eso además del dinero desaparecen los números: los avisos ya no están en
-- `listings` y las órdenes ya no están en `cobros_reales`.
--
-- ── QUÉ CAMBIA ───────────────────────────────────────────────────────
--
-- `delete_my_account` deja de borrar a ciegas y aplica LA MISMA regla, llamando
-- a LA MISMA función que decide en el panel (`tiene_rastro_comercial`), no a una
-- copia: si hubiera dos criterios acabarían separándose, que es como empezó
-- todo esto.
--
--   · Con rastro comercial → baja. Estado `inactive`, avisos activos a
--     pausados, historial intacto. `isBlocked` en src/lib/auth.ts ya impide
--     entrar con ese estado, así que la cuenta queda cerrada de verdad.
--   · Sin rastro → se borra, como hasta ahora. Guardar cuentas vacías no
--     protege de nada.
--
-- Y devuelve QUÉ hizo, para que la pantalla pueda decirlo en vez de afirmar
-- "se eliminaron tu cuenta y todos tus datos" cuando no es verdad.
--
-- ── Y QUEDA RASTRO ───────────────────────────────────────────────────
--
-- `delete_my_account` no escribía NADA en ninguna parte. Por eso, al investigar
-- este caso, no hubo forma de saber cuándo se borró la cuenta ni por qué camino:
-- `audit_logs` no tenía la entrada y el registro de `auth` lo purga Supabase.
-- Un borrado irreversible sin rastro no se puede ni auditar ni explicarle a
-- nadie. A partir de aquí lo deja escrito.
--
-- No se puede usar `log_audit` porque exige ser personal (0023) y aquí quien
-- llama es el propio usuario; se inserta directo, que para eso la función es
-- SECURITY DEFINER.
--
-- Idempotente.
-- =====================================================================

-- El tipo de retorno cambia (void → jsonb) y eso `create or replace` no lo
-- admite. El DROP se lleva los permisos por delante: se vuelven a conceder
-- abajo, y no es decorativo — por la 0104 una función nace SIN execute y el
-- botón daría 42501 en silencio.
drop function if exists public.delete_my_account();

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  uid uuid := auth.uid();
  v_rastro boolean;
begin
  if uid is null then
    raise exception 'No hay una sesión activa';
  end if;

  -- La MISMA función que usa `admin_delete_user`. Si aquí se escribiera nuestra
  -- propia versión del criterio, el día que cambie una cambiaría solo una.
  v_rastro := public.tiene_rastro_comercial(uid);

  if v_rastro then
    update public.profiles
       set status = 'inactive',
           updated_at = now()
     where id = uid;

    -- Sus avisos dejan de mostrarse: nadie va a atenderlos. Siguen contando en
    -- el total del panel y su historial de compras se conserva entero.
    update public.listings
       set status = 'paused'
     where owner_id = uid and status = 'active';

    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (uid, 'deactivate_user', 'user', uid::text,
            jsonb_build_object('motivo', 'tiene historial comercial',
                               'origen', 'el propio usuario'));

    -- Se cierran TODAS sus sesiones aquí y no solo en el navegador que pulsó:
    -- la cuenta sigue existiendo en `auth.users`, así que un token vivo en otro
    -- dispositivo seguiría sirviendo hasta caducar.
    delete from auth.sessions where user_id = uid;

    return jsonb_build_object('ok', true, 'accion', 'desactivado');
  end if;

  -- Sin rastro comercial: se borra de verdad, como hasta ahora. La entrada de
  -- auditoría va ANTES del delete: `audit_logs.actor_id` es SET NULL, así que
  -- la fila sobrevive al borrado aunque se quede sin autor, y el `entity_id`
  -- —que es texto y no una FK— conserva de quién se trataba.
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (uid, 'delete_user', 'user', uid::text,
          jsonb_build_object('origen', 'el propio usuario'));

  update public.pricing_settings set updated_by = null where updated_by = uid;
  delete from auth.users where id = uid;

  return jsonb_build_object('ok', true, 'accion', 'eliminado');
end;
$function$;

revoke all     on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Baja o borrado de la PROPIA cuenta, con la misma regla que el panel (0127): '
  'a quien ya contrató no se le borra, porque sus boletas están declaradas y '
  'pueden pedirse. Devuelve {accion: desactivado|eliminado}.';

-- ---------- ¿Qué me va a pasar a mí? ----------
-- Para que la pantalla pueda avisar ANTES de confirmar, en vez de prometer un
-- borrado total y hacer otra cosa. Solo responde sobre UNO MISMO: la
-- `tiene_rastro_comercial` de la 0127 acepta cualquier uuid y está concedida a
-- `authenticated`, así que exponerla tal cual dejaría a cualquiera preguntar por
-- la actividad comercial de otro.
create or replace function public.mi_cuenta_tiene_rastro()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select case when auth.uid() is null then false
              else public.tiene_rastro_comercial(auth.uid()) end;
$function$;

revoke all     on function public.mi_cuenta_tiene_rastro() from public, anon;
grant  execute on function public.mi_cuenta_tiene_rastro() to authenticated;

comment on function public.mi_cuenta_tiene_rastro() is
  'true si QUIEN LLAMA tiene avisos, órdenes o comprobantes. Lo usa la pantalla '
  'de Configuración para decir si "Eliminar cuenta" va a borrar o a dar de baja.';
