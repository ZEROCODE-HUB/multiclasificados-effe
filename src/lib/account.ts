import { supabase } from "@/lib/supabase";

/** Qué acabó pasando con la cuenta. La decide la base, no la pantalla. */
export type AccionDeBaja = "eliminado" | "desactivado";

/**
 * Cierra la cuenta del usuario actual.
 *
 * Llama al RPC `delete_my_account`, que desde la migración 0144 aplica la misma
 * regla que el panel (0127): a quien ya contrató NO se le borra —sus boletas
 * están declaradas ante SUNAT y pueden pedirse—, se le da de baja conservando
 * su historial. Solo se borra de verdad a quien nunca contrató nada.
 *
 * Devuelve cuál de las dos cosas ocurrió, porque son distintas y hay que
 * decírselo al usuario: antes la pantalla afirmaba siempre "se eliminaron tu
 * cuenta y todos tus datos", que para media plataforma era falso.
 *
 * En los dos casos la sesión local se cierra. Lanza si falla; el que llama
 * muestra el error y NO cierra sesión.
 */
export async function deleteMyAccount(): Promise<AccionDeBaja> {
  const { data, error } = await supabase.rpc("delete_my_account");
  if (error) throw error;

  // Si la cuenta se borró, el token apunta a un usuario que ya no existe; si se
  // dio de baja, `isBlocked` la rechazaría en el siguiente arranque. En los dos
  // casos lo que toca es salir.
  await supabase.auth.signOut();

  const accion = (data as { accion?: string } | null)?.accion;
  return accion === "desactivado" ? "desactivado" : "eliminado";
}

/**
 * ¿Esta cuenta tiene avisos, órdenes o comprobantes?
 *
 * Sirve para avisar ANTES de confirmar de qué va a pasar exactamente, que es lo
 * que pedía la 0131 para el panel y aquí faltaba. Si la consulta falla se
 * devuelve `null`: sin dato se enseña el texto genérico, pero el botón sigue
 * funcionando — quien decide de verdad es la base.
 */
export async function miCuentaTieneRastro(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("mi_cuenta_tiene_rastro");
  if (error) return null;
  return Boolean(data);
}
