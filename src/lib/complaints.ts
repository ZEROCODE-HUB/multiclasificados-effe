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
