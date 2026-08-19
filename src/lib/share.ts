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
// navegador nativo de Capacitor; en web abre una pestaña nueva EN ESCRITORIO,
// pero en móvil navega en la misma pestaña: al abrir `wa.me` en una pestaña
// nueva, el intent lanza la app de WhatsApp y la pestaña recién abierta queda
// huérfana en `about:blank` (IT2-030). Navegando en la actual, el usuario
// vuelve con "atrás" y no queda ninguna pestaña en blanco.
async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  const isTouch =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  if (isTouch) {
    window.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Comparte el aviso por WhatsApp (abre la app o WhatsApp Web con el mensaje).
//
// En nativo NO se pasa por `Browser.open` (MOB-07): abrir `wa.me` dentro del
// navegador embebido hacía que iOS pidiera permiso para saltar a WhatsApp y,
// tras aceptar, WhatsApp se abría VACÍO — el `?text=` se perdía en ese salto.
// El esquema `whatsapp://` va directo a la app y sí conserva el mensaje; el
// WebView de Capacitor lo delega al sistema. Si WhatsApp no está instalado el
// esquema no abre nada, así que se deja un respaldo por tiempo: si al segundo la
// pantalla sigue visible (no hubo cambio de app), se abre `wa.me` como antes.
export async function shareListingWhatsApp(title: string, listingId: string): Promise<void> {
  await abrirWhatsApp(shareMessage(title, listingUrl(listingId)));
}

/** URL de WhatsApp Web con el mensaje escrito, y el destinatario si se sabe. */
export function enlaceWhatsApp(mensaje: string, telefono?: string): string {
  const numero = (telefono ?? "").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Abre WhatsApp SIN abandonar la página actual, y devuelve si lo consiguió.
 *
 * `abrirWhatsApp` navega en la misma pestaña cuando el dispositivo es táctil
 * (ver el comentario de `openExternal`): al compartir un aviso da igual, porque
 * no queda nada que ver detrás. Al confirmar un pago sí importa — la página
 * tiene que quedarse para llevar al usuario a sus avisos y enseñarle el suyo
 * esperando confirmación. Comprobado en producción: se abría WhatsApp encima y
 * al volver con "atrás" seguía en el formulario de publicar, como si no
 * hubiera pasado nada.
 *
 * Es SÍNCRONA a propósito y hay que llamarla dentro del propio clic: después de
 * un `await`, los navegadores móviles ya no consideran que la apertura venga de
 * un gesto del usuario y la bloquean.
 */
export function abrirWhatsAppAparte(mensaje: string, telefono?: string): boolean {
  const url = enlaceWhatsApp(mensaje, telefono);
  try {
    const ventana = window.open(url, "_blank", "noopener,noreferrer");
    if (ventana) return true;
  } catch {
    /* bloqueador de ventanas emergentes */
  }
  return false;
}

/**
 * Abre WhatsApp con un mensaje escrito, y opcionalmente hacia un número
 * concreto (`telefono` en formato internacional sin signos: 51999888777).
 *
 * Sin número, WhatsApp pide a quién enviar — que es lo que hace falta al
 * compartir un aviso. Con número va directo a esa conversación, que es lo que
 * hace falta para mandarnos el voucher de un pago.
 */
export async function abrirWhatsApp(mensaje: string, telefono?: string): Promise<void> {
  const text = encodeURIComponent(mensaje);
  const numero = (telefono ?? "").replace(/\D/g, "");
  const webUrl = enlaceWhatsApp(mensaje, telefono);

  if (!Capacitor.isNativePlatform()) {
    await openExternal(webUrl);
    return;
  }

  let saltoAWhatsApp = false;
  const marcarSalto = () => {
    if (document.visibilityState === "hidden") saltoAWhatsApp = true;
  };
  document.addEventListener("visibilitychange", marcarSalto);
  window.location.assign(
    `whatsapp://send?${numero ? `phone=${numero}&` : ""}text=${text}`,
  );

  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", marcarSalto);
    if (saltoAWhatsApp || document.visibilityState === "hidden") return;
    void openExternal(webUrl);
  }, 1200);
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
