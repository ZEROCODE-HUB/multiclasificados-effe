// Preferencias de notificación por evento y canal (in-app / push / email).
// La tabla `notification_preferences` (0014_notifications.sql) tiene PK
// (user_id, event_type). La RPC `notify_user` de la BD respeta estas
// preferencias al crear notificaciones; los canales push/email los consume
// luego una Edge Function que lee la cola de `notifications`.
import { supabase } from "@/lib/supabase";

export interface NotifPref {
  in_app: boolean;
  push: boolean;
  email: boolean;
}

// Cuando no hay fila explícita, `notify_user` asume in-app activado y push/email
// apagados. La UI muestra ese mismo valor por defecto.
export const DEFAULT_PREF: NotifPref = { in_app: true, push: false, email: false };

export type UserRole = "anunciante" | "buscador";

export interface NotifEventDef {
  event: string;
  label: string;
  desc: string;
  // Roles para los que el evento tiene sentido. Sin `roles` = ambos.
  roles?: UserRole[];
}

// Eventos que el usuario puede controlar. Se dejan fuera los involuntarios de
// moderación (advertencias, suspensión, mensajes del equipo): esos llegan
// siempre por seguridad/soporte.
export const NOTIF_EVENTS: NotifEventDef[] = [
  { event: "new_message", label: "Mensajes nuevos", desc: "Cuando alguien te escribe por un aviso." },
  { event: "saved_search_match", label: "Coincidencias de búsqueda", desc: "Avisos nuevos que coinciden con tus búsquedas guardadas.", roles: ["buscador"] },
  { event: "application_status", label: "Estado de postulaciones", desc: "Cuando cambia el estado de una postulación tuya.", roles: ["buscador"] },
  { event: "new_application", label: "Postulaciones recibidas", desc: "Cuando alguien postula a tu aviso de empleo.", roles: ["anunciante"] },
  { event: "new_review", label: "Nuevas reseñas", desc: "Cuando recibes una reseña." },
  { event: "listing_expiring", label: "Avisos por vencer", desc: "Cuando un aviso tuyo está por expirar.", roles: ["anunciante"] },
];

export function eventsForRole(role: UserRole): NotifEventDef[] {
  return NOTIF_EVENTS.filter((e) => !e.roles || e.roles.includes(role));
}

// Lee todas las preferencias del usuario como un mapa event_type → NotifPref.
// Los eventos sin fila no aparecen: usar `prefOrDefault` al leer. Ante cualquier
// error devuelve {} (la UI cae a los valores por defecto).
export async function fetchNotificationPrefs(): Promise<Record<string, NotifPref>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return {};
    const { data, error } = await supabase
      .from("notification_preferences")
      .select("event_type, in_app, push, email");
    if (error || !data) return {};
    const map: Record<string, NotifPref> = {};
    for (const row of data as Array<{ event_type: string } & NotifPref>) {
      map[row.event_type] = { in_app: row.in_app, push: row.push, email: row.email };
    }
    return map;
  } catch {
    return {};
  }
}

export function prefOrDefault(map: Record<string, NotifPref>, event: string): NotifPref {
  return map[event] ?? DEFAULT_PREF;
}

// Inserta o actualiza la preferencia de un evento (upsert por la PK compuesta).
export async function saveNotificationPref(event: string, pref: NotifPref): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para cambiar tus preferencias.");
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, event_type: event, ...pref }, { onConflict: "user_id,event_type" });
  if (error) throw new Error(error.message);
}
