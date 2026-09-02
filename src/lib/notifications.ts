// REQ-09: notificaciones in-app. La BD ya genera notificaciones vía
// `notify_user` (nuevos mensajes, cambios de postulación, reseñas y
// coincidencias de búsquedas guardadas). Aquí las leemos y escuchamos en vivo.
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { cuerpoDeNotificacion, rutaDeNotificacion } from "@/lib/textoDeNotificacion";

export interface AppNotification {
  id: string;
  type: string;
  title: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

let notifSeq = 0;

export async function getMyUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function fetchNotifications(limit = 20): Promise<AppNotification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, title, payload, read_at, created_at")
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  } catch {
    return [];
  }
}

export async function fetchUnreadNotifications(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  try {
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("channel", "in_app")
      .is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export async function markAllNotificationsRead(): Promise<void> {
  // La RLS limita el update a las notificaciones del usuario actual.
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .eq("channel", "in_app");
}

export function subscribeToNotifications(userId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`notifications:${userId}:${(notifSeq += 1)}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      onChange
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      onChange
    )
    .subscribe();
}

export function unsubscribeNotifications(channel: RealtimeChannel | null) {
  if (channel) supabase.removeChannel(channel);
}

/**
 * Texto y destino de una notificación.
 *
 * Las dos son ahora envoltorios de `@/lib/textoDeNotificacion`, que es el ÚNICO
 * sitio donde se decide qué dice y adónde lleva cada tipo. Antes esto era un
 * `switch` de 15 casos aquí, otro de 9 en la Edge Function del correo y otro de
 * 5 en la del push, escritos por separado: lo que no estaba en la lista de cada
 * uno acababa en un "Tienes una notificación" sin decir de qué ni adónde ir.
 *
 * Se mantienen los dos nombres porque los usa media aplicación (y sus pruebas).
 */
export function notificationText(n: AppNotification): string {
  return cuerpoDeNotificacion(n.type, n.payload, n.title);
}

/**
 * Destino al hacer clic. "#" y no "" cuando no hay ninguno: es lo que espera un
 * <Link> de react-router para no navegar a ningún sitio.
 */
export function notificationLink(n: AppNotification, role: string): string {
  return rutaDeNotificacion(n.type, n.payload, role) || "#";
}
