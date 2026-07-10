import { supabase } from "@/lib/supabase";

/**
 * Borra DEFINITIVAMENTE la cuenta del usuario actual.
 *
 * Llama al RPC `delete_my_account` (migración 0053), que solo puede borrar al
 * propio usuario (auth.uid()). La cascada de la BD elimina perfil, avisos,
 * favoritos, mensajes, créditos, etc. Después cierra la sesión localmente.
 *
 * Lanza si el borrado falla; el que llama muestra el error y NO cierra sesión.
 */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
  // La cuenta ya no existe: limpiamos la sesión local para no dejar un token
  // huérfano apuntando a un usuario borrado.
  await supabase.auth.signOut();
}
