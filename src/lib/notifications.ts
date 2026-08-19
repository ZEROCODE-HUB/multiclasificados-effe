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
    case "admin_message":
      return (p.body as string) || n.title || "Mensaje del equipo";
    case "saved_search_match": {
      const count = Number(p.count ?? 0);
      const name = (p.name as string) || "tu búsqueda";
      return `${count} ${count === 1 ? "nuevo aviso" : "nuevos avisos"} para "${name}"`;
    }
    case "new_message":
      return (p.preview as string) ? `Nuevo mensaje: "${p.preview}"` : "Tienes un nuevo mensaje";
    case "application_status": {
      const map: Record<string, string> = {
        pending: "Pendiente", reviewed: "En revisión", interview: "En entrevista",
        accepted: "Aceptada", rejected: "Rechazada",
      };
      const st = map[(p.status as string)] ?? (p.status as string);
      return `Tu postulación cambió a: ${st}`;
    }
    case "new_review":
      return `Recibiste una nueva reseña (${p.rating ?? "—"}★)`;
    case "new_application": {
      const title = (p.listing_title as string) || "tu aviso";
      return `Nueva postulación en "${title}"`;
    }
    case "listing_disabled": {
      const title = (p.listing_title as string) || "Tu aviso";
      const reason = (p.reason as string) || "";
      return reason
        ? `"${title}" fue deshabilitado: ${reason}`
        : `"${title}" fue deshabilitado por moderación`;
    }
    case "listing_enabled":
      return `"${(p.listing_title as string) || "Tu aviso"}" volvió a estar visible`;
    case "listing_expiring": {
      const title = (p.listing_title as string) || "Tu aviso";
      // Desde la 0113 el aviso llega con tres días de antelación y trae cuántos
      // quedan: decir "vence pronto" sin la cifra no ayuda a decidir.
      const dias = Number(p.dias);
      const cuando = Number.isFinite(dias) && dias > 0
        ? `vence en ${dias} ${dias === 1 ? "día" : "días"}`
        : "está por vencer";
      return `"${title}" ${cuando}. Renuévalo o publica uno igual para que siga visible.`;
    }
    case "moderation_warning": {
      const reason = (p.reason as string) || "";
      const note = (p.note as string) || "";
      const base = reason ? `Advertencia por: ${reason}` : "Recibiste una advertencia de moderación";
      return note ? `${base}. ${note}` : base;
    }
    case "invoice_voided": {
      // Lo que el usuario nota es que le baja el saldo. El aviso tiene que
      // explicar eso antes que nada, y solo después el papeleo.
      const numero = (p.number as string) || "una de tus compras";
      const retirados = Number(p.credits ?? 0);
      const motivo = (p.reason as string) || "";
      const base = retirados > 0
        ? `Se anuló ${numero} y se retiraron ${retirados} créditos de tu saldo`
        : `Se anuló ${numero}`;
      return motivo ? `${base}. Motivo: ${motivo}` : `${base}.`;
    }
    case "manual_payment_approved": {
      // Lo que la persona estaba esperando: si pagó para publicar, saber que su
      // aviso ya está fuera; si recargó, que el saldo entró.
      const publicado = p.published === true;
      const proposito = String(p.purpose ?? "");
      if (proposito === "publish") {
        return publicado
          ? "Confirmamos tu pago y tu aviso ya está publicado."
          : "Confirmamos tu pago y se acreditó tu saldo. Tu aviso está a un paso de publicarse.";
      }
      if (proposito === "renew") {
        return publicado
          ? "Confirmamos tu pago y tu aviso ya está renovado."
          : "Confirmamos tu pago y se acreditó tu saldo.";
      }
      const monto = Number(p.monto ?? 0);
      return monto > 0
        ? `Confirmamos tu pago: se acreditaron S/ ${monto.toFixed(2)} a tu saldo.`
        : "Confirmamos tu pago y se acreditó tu saldo.";
    }
    case "manual_payment_rejected": {
      const motivo = (p.motivo as string) || "";
      const base = "No pudimos confirmar tu pago";
      return motivo ? `${base}: ${motivo}` : `${base}. Escríbenos para revisarlo.`;
    }
    case "account_suspended": {
      const reason = (p.reason as string) || "";
      return reason
        ? `Tu cuenta fue suspendida: ${reason}`
        : "Tu cuenta fue suspendida por moderación";
    }
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
    case "new_application":
      // El dueño revisa las postulaciones recibidas en su panel de anunciante.
      return "/dashboard/anunciante/postulaciones";
    case "listing_disabled":
    case "listing_enabled":
    case "listing_expiring":
      // Va directo a sus avisos: ahí tiene "Renovar" y "Publicar uno igual".
      return "/dashboard/anunciante/avisos";
    case "invoice_voided":
      // Allí ve el comprobante marcado como anulado y su motivo.
      return "/dashboard/anunciante/boletas";
    case "manual_payment_approved":
      // Si el pago era de un aviso, lo que quiere ver es el aviso; si fue una
      // recarga, su comprobante.
      return p.purpose === "publish" || p.purpose === "renew"
        ? "/dashboard/anunciante/avisos"
        : "/dashboard/anunciante/boletas";
    case "manual_payment_rejected":
      return "/dashboard/anunciante";
    default:
      return "#";
  }
}
