// Registro del service worker que hace INSTALABLE la web (ver public/sw.js).
//
// Se mantiene aparte de `main.tsx` por una razón muy concreta: aquí está también
// la salida de emergencia. Un service worker sobrevive a los despliegues, así
// que si el de `public/sw.js` tuviera un fallo grave, cambiarlo en el servidor
// no bastaría para todo el mundo. `VITE_PWA=off` desactiva el registro y ADEMÁS
// desinstala el que ya esté puesto, que es lo que de verdad hace falta.
import { Capacitor } from "@capacitor/core";

/** Interruptor de despliegue: `VITE_PWA=off` apaga y limpia. */
const APAGADA = String(import.meta.env.VITE_PWA ?? "").toLowerCase() === "off";

/**
 * Quita cualquier service worker registrado y vacía sus cachés.
 *
 * Es la salida de emergencia y también lo que corre dentro del APK y del
 * iPhone: allí la aplicación ya es nativa y un service worker por debajo solo
 * puede estorbar. Si alguien abrió antes la web en el navegador del sistema, no
 * hay nada que limpiar; si Capacitor sirviera desde el mismo origen, sí.
 */
async function desinstalar(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registros = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registros.map((r) => r.unregister()));
    if ("caches" in window) {
      const claves = await caches.keys();
      await Promise.all(claves.filter((k) => k.startsWith("effe-")).map((k) => caches.delete(k)));
    }
  } catch {
    // Un navegador que no deja tocar los registros (modo privado de algunos,
    // Safari con restricciones) no es motivo para tumbar el arranque.
  }
}

export function registrarPWA(): void {
  // En el APK y en el iPhone la aplicación ya es nativa: la instalación la hace
  // la tienda y el service worker no pinta nada. Peor: se quedaría cacheando
  // los assets de un `capacitor://` y compitiendo con la actualización por OTA.
  if (Capacitor.isNativePlatform() || APAGADA) {
    void desinstalar();
    return;
  }

  if (!("serviceWorker" in navigator)) return;
  // `localhost` incluido: es el único sitio, además de https, donde el
  // navegador permite un service worker, y conviene poder probarlo en local.
  if (location.protocol !== "https:" && location.hostname !== "localhost") return;

  // Después del `load`: registrar antes compite por el ancho de banda con el
  // bundle y con la primera pintura, que es justo lo que mide el LCP.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Que falle el registro no puede impedir que la aplicación funcione: sin
      // service worker simplemente no se puede instalar, y ya está.
    });
  });
}
