// Verificación de identidad (DNI / RUC) vía la Edge Function `verify-doc`,
// que consulta la API de Factiliza server-side. El token de Factiliza vive
// como secret en Supabase y nunca llega al navegador.
import { supabase } from "@/lib/supabase";

export type DocType = "dni" | "ruc";

/**
 * Normaliza lo que el usuario escribe o pega en un campo de DNI/RUC.
 *
 * Filtra PRIMERO y recorta después. El orden importa: con `maxLength` en el
 * <input>, el navegador trunca el texto crudo antes de que podamos limpiarlo, así
 * que pegar "4444 5555" (formato habitual al copiar un DNI) dejaba "44 44 55" →
 * "444455" y el campo nunca llegaba a los 8 dígitos. Por eso los campos no llevan
 * `maxLength`: el tope lo pone este helper, ya sobre los dígitos.
 */
export function normalizeDocNumber(value: string, maxLen: number): string {
  return value.replace(/\D/g, "").slice(0, maxLen);
}

export interface VerifyDocResult {
  ok: boolean;
  nombre?: string; // Nombre completo (DNI) o razón social (RUC)
  data?: Record<string, unknown>;
  error?: string;
}

export async function verifyDocument(tipo: DocType, numero: string): Promise<VerifyDocResult> {
  const doc = numero.replace(/\D/g, "");

  // Validación rápida en cliente antes de gastar una consulta.
  if (tipo === "dni" && doc.length !== 8) return { ok: false, error: "El DNI debe tener 8 dígitos." };
  if (tipo === "ruc" && doc.length !== 11) return { ok: false, error: "El RUC debe tener 11 dígitos." };

  const { data, error } = await supabase.functions.invoke("verify-doc", {
    body: { tipo, numero: doc },
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

  if (!data?.success) {
    return { ok: false, error: data?.error ?? "No se pudo verificar el documento." };
  }

  return { ok: true, nombre: data.nombre, data: data.data };
}
