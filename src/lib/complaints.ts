// Capa de datos del Libro de Reclamaciones.
// Envía el reclamo a la Edge Function `send-reclamo`, que lo guarda en la BD
// y despacha el correo a reclamos@coleffe.com y soporte@coleffe.com vía Resend.
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
  error?: string;
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

  return { ok: true, code: data?.code };
}
