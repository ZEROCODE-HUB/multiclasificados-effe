// Compartir un aviso: por WhatsApp, copiando el enlace o con la hoja nativa del
// sistema. Funciona en web (escritorio/móvil) y en el APK (Capacitor).
import { Capacitor } from "@capacitor/core";

// Base pública de los enlaces compartibles. En el APK, `location.origin` es un
// esquema interno (p. ej. https://localhost) que no es accesible desde fuera,
// así que usamos el dominio público configurado. En web cae a location.origin.
const PUBLIC_BASE =
  ((import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || "").replace(/\/+$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

// URL absoluta y compartible del detalle de un aviso (/aviso/:id).
export function listingUrl(listingId: string): string {
  return `${PUBLIC_BASE}/aviso/${listingId}`;
}

// Texto que acompaña al enlace al compartir.
function shareMessage(title: string, url: string): string {
  return title ? `${title}\n${url}` : url;
}

// Abre una URL saliendo de la app (WhatsApp, navegador…). En el APK usa el
// navegador nativo de Capacitor; en web abre una pestaña nueva.
async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Comparte el aviso por WhatsApp (abre la app o WhatsApp Web con el mensaje).
export async function shareListingWhatsApp(title: string, listingId: string): Promise<void> {
  const url = listingUrl(listingId);
  await openExternal(`https://wa.me/?text=${encodeURIComponent(shareMessage(title, url))}`);
}

// Copia el enlace del aviso al portapapeles. Devuelve true si lo logró.
export async function copyListingLink(listingId: string): Promise<boolean> {
  const url = listingUrl(listingId);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

// True si el dispositivo soporta la hoja de compartir nativa (Web Share API).
export function canSystemShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

// Abre la hoja de compartir nativa del sistema. Devuelve false si no está
// disponible (para caer al menú manual). Cancelar cuenta como manejado.
export async function shareListingSystem(title: string, listingId: string): Promise<boolean> {
  if (!canSystemShare()) return false;
  const url = listingUrl(listingId);
  try {
    await navigator.share({ title, text: title, url });
  } catch {
    // El usuario canceló o el navegador falló; no hace falta avisar.
  }
  return true;
}
