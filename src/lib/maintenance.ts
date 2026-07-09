import { supabase } from "@/lib/supabase";

/**
 * ¿Está la plataforma en modo mantenimiento?
 *
 * Usa `is_maintenance_mode()` (migración 0045) y no `get_settings()`, que solo
 * responde al staff: un visitante anónimo tiene que poder saberlo para que se le
 * muestre la pantalla de mantenimiento.
 *
 * Ante cualquier fallo devuelve false. Es deliberado: si la consulta no responde,
 * es preferible dejar la app abierta a dejar a todo el mundo fuera por un error
 * de red. El mantenimiento se activa a propósito, no por accidente.
 */
export async function fetchMaintenanceMode(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_maintenance_mode");
    if (error) throw error;
    return data === true;
  } catch {
    return false;
  }
}
