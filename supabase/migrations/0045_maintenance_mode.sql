-- =====================================================================
-- 0045_maintenance_mode.sql — El modo mantenimiento se puede consultar.
--
-- El interruptor de "Variables del sistema" guardaba el valor y nadie lo leía:
-- la app nunca se bloqueaba. Para bloquearla hace falta que CUALQUIER visitante
-- pueda saber si está activo, y `get_settings()` no sirve: filtra por
-- `is_staff(auth.uid())` y ni siquiera está concedida a `anon`.
--
-- Esta función expone ese único valor —y nada más— a todo el mundo.
--
-- El valor se guarda como jsonb: `set_setting` recibe lo que mande el cliente,
-- así que puede llegar como boolean (true) o como string ("true"). Se aceptan
-- ambos; cualquier otra cosa, o la ausencia de la fila, significa "apagado".
-- Idempotente.
-- =====================================================================

create or replace function public.is_maintenance_mode()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case jsonb_typeof(s.value)
              when 'boolean' then s.value::text::boolean
              when 'string'  then lower(s.value #>> '{}') in ('true', '1')
              else false
            end
       from public.system_settings s
      where s.key = 'maintenance_mode'),
    false
  );
$$;

-- Lo consulta también quien no ha iniciado sesión: si no, un visitante anónimo
-- entraría a la plataforma con el mantenimiento activado.
grant execute on function public.is_maintenance_mode() to anon, authenticated;
