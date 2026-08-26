// Capa de datos del Libro de Reclamaciones.
// Envía el reclamo a la Edge Function `send-reclamo`, que lo guarda en la BD y
// despacha DOS correos vía Resend: el acuse de recibo al consumidor (con copia
// de su hoja en PDF, obligatorio por el Reglamento del Libro de Reclamaciones)
// y el aviso interno a avisos@coleffe.com (secret RECLAMOS_TO).
import { supabase } from "@/lib/supabase";

export type ComplaintKind = "reclamo" | "queja";
export type ComplaintGoodType = "producto" | "servicio";
export type ComplaintDocType = "DNI" | "CE" | "Pasaporte" | "RUC";

export interface ComplaintInput {
  kind: ComplaintKind;          // Reclamo (disconformidad por el bien) o Queja (atención)
  fullName: string;
  docType: ComplaintDocType;
  docNumber: string;
  email: string;
  phone: string;
  address: string;
  goodType: ComplaintGoodType;  // Producto o Servicio
  amount?: string;              // Monto reclamado (opcional)
  description: string;          // Detalle del reclamo/queja
  request: string;              // Pedido del consumidor
}

export interface ComplaintResult {
  ok: boolean;
  code?: string;   // Código/correlativo del reclamo (Hoja de Reclamación N.º)
  /**
   * Momento del registro, tal como lo selló la base de datos. Es la constancia
   * de fecha y hora que exige la norma, así que se muestra la del servidor y no
   * la del reloj del teléfono, que puede estar en cualquier hora.
   */
  createdAt?: string;
  /** Si el acuse de recibo con la copia llegó a salir hacia el correo indicado. */
  ackSent?: boolean;
  error?: string;
}

/** Fecha y hora del registro en hora de Perú, para mostrarla al consumidor. */
export function formatComplaintDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).format(d).replace(", ", " ");
}

export async function submitComplaint(input: ComplaintInput): Promise<ComplaintResult> {
  const { data, error } = await supabase.functions.invoke("send-reclamo", {
    body: input,
  });

  if (error) {
    // El cuerpo de error de una Edge Function viene en error.context (Response).
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch {
      /* se mantiene el mensaje original */
    }
    return { ok: false, error: message };
  }

  return {
    ok: true,
    code: data?.code,
    createdAt: data?.created_at,
    // Si la función no lo dice (versión anterior desplegada), se asume que sí:
    // no tiene sentido alarmar al consumidor por un campo que falta.
    ackSent: data?.ack_sent !== false,
  };
}

// --------------------------------------------------------------- Panel (B-09)

/** Un reclamo tal como lo ve administración. */
export interface ReclamoAdmin {
  id: string;
  code: number | null;
  kind: ComplaintKind;
  fullName: string;
  docType: string;
  docNumber: string;
  email: string;
  phone: string;
  address: string;
  goodType: string;
  amount: string | null;
  description: string;
  request: string;
  status: "pendiente" | "en_proceso" | "resuelto";
  createdAt: string;
  respuesta: string | null;
  respondidaAt: string | null;
  /** Si el correo de respuesta salió. `null` = todavía no se respondió. */
  respuestaEmailStatus: string | null;
  respuestaEmailError: string | null;
  /** Si el acuse de recibo inicial llegó a salir. */
  ackStatus: string | null;
}

export interface FiltroReclamos {
  buscar?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
}

const mapReclamo = (r: Record<string, unknown>): ReclamoAdmin => ({
  id: String(r.id),
  code: r.code == null ? null : Number(r.code),
  kind: r.kind === "queja" ? "queja" : "reclamo",
  fullName: String(r.full_name ?? ""),
  docType: String(r.doc_type ?? ""),
  docNumber: String(r.doc_number ?? ""),
  email: String(r.email ?? ""),
  phone: String(r.phone ?? ""),
  address: String(r.address ?? ""),
  goodType: String(r.good_type ?? ""),
  amount: (r.amount as string) ?? null,
  description: String(r.description ?? ""),
  request: String(r.request ?? ""),
  status: (r.status as ReclamoAdmin["status"]) ?? "pendiente",
  createdAt: String(r.created_at ?? ""),
  respuesta: (r.respuesta as string) ?? null,
  respondidaAt: (r.respondida_at as string) ?? null,
  respuestaEmailStatus: (r.respuesta_email_status as string) ?? null,
  respuestaEmailError: (r.respuesta_email_error as string) ?? null,
  ackStatus: (r.ack_email_status as string) ?? null,
});

/**
 * Los reclamos para el panel. Solo personal (lo impone la RLS del servidor).
 *
 * Devuelve la lista entera de lo filtrado, no una página: el Libro se consulta
 * de tanto en tanto y se exporta completo para Indecopi. Paginar aquí obligaría
 * a repetir la consulta para exportar, y ya nos pasó con las boletas que la
 * exportación se llevara solo la primera página.
 */
export async function fetchReclamos(filtro: FiltroReclamos = {}): Promise<ReclamoAdmin[]> {
  let consulta = supabase.from("complaints").select("*").order("created_at", { ascending: false });

  if (filtro.estado && filtro.estado !== "all") consulta = consulta.eq("status", filtro.estado);
  if (filtro.desde) consulta = consulta.gte("created_at", filtro.desde);
  // `hasta` incluye el día entero: sin esto, filtrar "hasta hoy" dejaría fuera
  // todo lo de hoy, que es justo lo que se busca al abrir esta pantalla.
  if (filtro.hasta) consulta = consulta.lt("created_at", `${filtro.hasta}T23:59:59.999Z`);
  if (filtro.buscar?.trim()) {
    const q = filtro.buscar.trim();
    consulta = consulta.or(
      `full_name.ilike.%${q}%,doc_number.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapReclamo(r as Record<string, unknown>));
}

/**
 * Responde a un reclamo: guarda la respuesta y se la manda al consumidor.
 *
 * En ese orden a propósito. La respuesta se registra ANTES de enviarse porque
 * el Reglamento obliga a poder acreditarla: si el correo falla, el expediente
 * está completo y se puede reintentar. Al revés dejaría un consumidor
 * respondido y un registro vacío.
 */
export async function responderReclamo(
  id: string,
  respuesta: string,
  estado: "en_proceso" | "resuelto" = "resuelto",
): Promise<{ correoEnviado: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("responder_reclamo", {
    p_id: id, p_respuesta: respuesta, p_estado: estado,
  });
  if (error) throw new Error(error.message);

  const d = (data ?? {}) as { email?: string; full_name?: string; code?: number; kind?: string };
  try {
    const { data: env } = await supabase.functions.invoke("send-reclamo", {
      body: {
        accion: "responder",
        id, respuesta,
        email: d.email, full_name: d.full_name, code: d.code, kind: d.kind,
      },
    });
    const r = (env ?? {}) as { ok?: boolean; error?: string };
    return { correoEnviado: r.ok === true, error: r.error };
  } catch (e) {
    // La respuesta ya está guardada: esto solo informa de que el correo no
    // salió, no deshace nada.
    return { correoEnviado: false, error: e instanceof Error ? e.message : "No se pudo enviar" };
  }
}

/** Cambia el estado de un reclamo sin responderlo (p. ej. ponerlo en proceso). */
export async function cambiarEstadoReclamo(id: string, estado: string): Promise<void> {
  const { error } = await supabase.from("complaints").update({ status: estado }).eq("id", id);
  if (error) throw new Error(error.message);
}
