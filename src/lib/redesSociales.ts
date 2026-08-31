// Los enlaces de redes sociales del pie de la portada (punto B-16).
//
// Viven en `system_settings` y los edita el administrador desde Comercial →
// Variables del sistema, así que cambiar una cuenta no cuesta un despliegue.
// La migración 0134 los expone con `redes_sociales()`, legible sin sesión.
import { supabase } from "@/lib/supabase";

/** Las seis redes que pidió el cliente, en el orden en que van en el pie. */
export const REDES = [
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
  "whatsapp",
] as const;

export type Red = (typeof REDES)[number];

/** Nombre visible de cada red. Va al `aria-label` y al tooltip del icono. */
export const NOMBRE_RED: Record<Red, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

export type RedesSociales = Partial<Record<Red, string>>;

/**
 * Convierte lo que escribió el administrador en un `href` que se puede pintar.
 *
 * ESTO NO ES COSMÉTICA, ES LA DEFENSA DEL PIE.
 *
 * El valor lo teclea una persona en un campo de texto y acaba dentro de un
 * `<a href>` que ve todo el mundo. Un `javascript:alert(1)` ahí es XSS servido
 * en la portada, y le bastaría a un administrador despistado que pegue algo que
 * le pasaron. Por eso solo se admite `http:` y `https:`, comprobados con el
 * parser de URL del navegador y no con una expresión regular: `java\tscript:`
 * y `JaVaScRiPt:` engañan a casi cualquier regex y no al parser.
 *
 * Lo que no sea una URL válida devuelve null y el icono sencillamente no sale.
 * Un icono que no lleva a ninguna parte es peor que la ausencia del icono.
 */
export function enlaceDeRed(red: Red, valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim();
  if (!v) return null;

  // WhatsApp se guarda como NÚMERO, no como URL: es lo que pidió el cliente
  // («se conectará al número +51 903 375 308») y lo que sabe escribir quien
  // administra. Aquí se construye el enlace.
  if (red === "whatsapp") {
    // Si aun así pegaron el enlace entero, se acepta y se sigue por la vía
    // normal: obligar a borrar el "https://wa.me/" sería una trampa tonta.
    if (!/^https?:/i.test(v)) {
      const numero = v.replace(/\D/g, "");
      // Un número peruano son 9 dígitos más el 51 del país. Menos de 8 es un
      // dedazo, y un `wa.me/5` abre WhatsApp con un error.
      return numero.length >= 8 ? `https://wa.me/${numero}` : null;
    }
  }

  // Sin esquema no hay URL válida, y quien administra escribe "coleffe.com" o
  // "www.facebook.com/algo" tan a menudo como el enlace completo.
  const conEsquema = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;

  try {
    const url = new URL(conEsquema);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Lee los enlaces configurados y devuelve SOLO los que llevan a algún sitio.
 *
 * Ante cualquier fallo devuelve `{}`, igual que `configYapePlin` y
 * `fetchMaintenanceMode`: el pie de la portada no puede quedarse en blanco
 * porque la base tarde en responder. Sin enlaces no hay iconos, y ya está.
 */
export async function fetchRedesSociales(): Promise<RedesSociales> {
  try {
    const { data, error } = await supabase.rpc("redes_sociales");
    if (error) throw error;
    return normalizarRedes(data);
  } catch {
    return {};
  }
}

/** Separado de la llamada para poder probarlo sin base de datos. */
export function normalizarRedes(data: unknown): RedesSociales {
  if (!data || typeof data !== "object") return {};
  const crudo = data as Record<string, unknown>;
  const out: RedesSociales = {};
  for (const red of REDES) {
    const valor = crudo[red];
    const href = enlaceDeRed(red, typeof valor === "string" ? valor : null);
    if (href) out[red] = href;
  }
  return out;
}
