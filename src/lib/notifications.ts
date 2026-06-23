// REQ-09: notificaciones in-app. La BD ya genera notificaciones vía
// `notify_user` (nuevos mensajes, cambios de postulación, reseñas y
// coincidencias de búsquedas guardadas). Aquí las leemos y escuchamos en vivo.
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

// Texto legible según el tipo de evento.
export function notificationText(n: AppNotification): string {
  const p = n.payload || {};
  switch (n.type) {
    case "saved_search_match": {
      const count = Number(p.count ?? 0);
      const name = (p.name as string) || "tu búsqueda";
      return `${count} ${count === 1 ? "nuevo aviso" : "nuevos avisos"} para "${name}"`;
    }
    case "new_message":
      return (p.preview as string) ? `Nuevo mensaje: "${p.preview}"` : "Tienes un nuevo mensaje";
    case "application_status": {
      const map: Record<string, string> = {
        pending: "Pendiente", reviewed: "En revisión", accepted: "Aceptada", rejected: "Rechazada",
      };
      const st = map[(p.status as string)] ?? (p.status as string);
      return `Tu postulación cambió a: ${st}`;
    }
    case "new_review":
      return `Recibiste una nueva reseña (${p.rating ?? "—"}★)`;
    default:
      return n.title || "Notificación";
  }
}

// Destino al hacer clic, según el tipo.
export function notificationLink(n: AppNotification, role: string): string {
  const p = n.payload || {};
  const base = role === "anunciante" ? "anunciante" : "buscador";
  switch (n.type) {
    case "saved_search_match":
      return "/dashboard/buscador/busquedas";
    case "new_message":
      return `/dashboard/${base}/mensajes${p.conversation_id ? `?c=${p.conversation_id}` : ""}`;
    case "application_status":
    case "new_review":
      return p.listing_id ? `/aviso/${p.listing_id}` : "#";
    default:
      return "#";
  }
}
