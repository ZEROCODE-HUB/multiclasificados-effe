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

/**
 * Igual, pero para documentos que LLEVAN letras: carne de extranjeria y
 * pasaporte. Quitarles las letras (que es lo que hace normalizeDocNumber) los
 * dejaria irreconocibles en la boleta.
 */
export function normalizeDocAlfanumerico(value: string, maxLen: number): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, maxLen);
}

/**
 * Por qué falló una verificación.
 *
 * Existe porque "no existe" y "no se pudo comprobar" NO son lo mismo, y hasta
 * B-10 llegaban indistinguibles: los dos como `ok: false`. Daba igual mientras
 * la verificación solo servía para rellenar una boleta; deja de dar igual desde
 * que reportar un aviso exige documento, porque negar un reporte cuando el
 * servicio está caído es silenciar una denuncia real por una avería nuestra.
 *
 * `undefined` = la función desplegada es anterior a este campo. Se trata como
 * "no se pudo": ante la duda, no se bloquea a nadie.
 */
export type CausaFalloDoc = "no_existe" | "servicio" | "entrada" | "cuota";

export interface VerifyDocResult {
  ok: boolean;
  nombre?: string; // Nombre completo (DNI) o razón social (RUC)
  data?: Record<string, unknown>;
  error?: string;
  causa?: CausaFalloDoc;
  /**
   * El servidor cortó por exceso de consultas (5/hora, 10/día). No es un
   * documento inválido: reintentar con otro número tampoco va a funcionar, así
   * que la pantalla no debe empujar a seguir probando.
   */
  rateLimited?: boolean;
}

export async function verifyDocument(tipo: DocType, numero: string): Promise<VerifyDocResult> {
  const doc = numero.replace(/\D/g, "");

  // Validación rápida en cliente antes de gastar una consulta.
  if (tipo === "dni" && doc.length !== 8) return { ok: false, error: "El DNI debe tener 8 dígitos.", causa: "entrada" };
  if (tipo === "ruc" && doc.length !== 11) return { ok: false, error: "El RUC debe tener 11 dígitos.", causa: "entrada" };

  const { data, error } = await supabase.functions.invoke("verify-doc", {
    body: { tipo, numero: doc },
  });

  if (error) {
    // El cuerpo de error de una Edge Function viene en error.context (Response).
    let message = error.message;
    let rateLimited = false;
    let causa: CausaFalloDoc | undefined;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) message = body.error;
        rateLimited = body?.rate_limited === true || ctx.status === 429;
        causa = body?.causa as CausaFalloDoc | undefined;
      }
    } catch {
      /* se mantiene el mensaje original */
    }
    // Un fallo al invocar la función es red o despliegue: nunca dice nada sobre
    // el documento. Si vino con cuerpo, se respeta su `causa`.
    return { ok: false, error: message, rateLimited, causa: causa ?? "servicio" };
  }

  if (!data?.success) {
    return {
      ok: false,
      error: data?.error ?? "No se pudo verificar el documento.",
      causa: data?.causa as CausaFalloDoc | undefined,
      rateLimited: data?.rate_limited === true,
    };
  }

  return { ok: true, nombre: data.nombre, data: data.data };
}
