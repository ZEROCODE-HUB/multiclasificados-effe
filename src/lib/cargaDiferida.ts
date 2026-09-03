// Carga diferida de páginas que sobrevive a un despliegue.
//
// EL PROBLEMA. Las páginas del panel se cargan con `lazy(() => import(...))`,
// que descarga un archivo con el hash del contenido en el nombre
// (SettingsPage-tBDPHwQP.js). Al desplegar, esos archivos se sustituyen por
// otros con hash nuevo y los viejos desaparecen. Cualquiera que tuviera la app
// ABIERTA sigue con el index.html anterior en memoria, así que al entrar en una
// sección que aún no había visitado pide un archivo que ya no está:
//
//   TypeError: Failed to fetch dynamically imported module: .../SettingsPage-tBDPHwQP.js
//
// Y la pantalla se queda en el error de arranque. Le pasa a TODO el que tuviera
// la pestaña abierta, en CADA despliegue.
//
// Se agrava porque `vercel.json` reescribe cualquier ruta a `index.html`: el
// archivo que falta no devuelve 404 sino el HTML de la app con código 200, y el
// navegador intenta ejecutarlo como si fuera JavaScript. Por eso el mensaje es
// tan raro. (La reescritura ya excluye `/assets/`, así que ahora sí es un 404
// honesto, pero la recuperación de aquí funciona igual en ambos casos.)
//
// LA SOLUCIÓN. Si el archivo no se puede cargar, casi siempre es porque hay una
// versión nueva: se recarga la página una vez y el navegador se trae el
// index.html actual con los nombres correctos. Una sola vez, porque si tras
// recargar vuelve a fallar el problema es otro (sin conexión, un archivo
// corrupto) y entrar en un bucle de recargas es peor que enseñar el error.
import { lazy, type ComponentType } from "react";

const MARCA = "effe:recarga-por-modulo";
// Margen para considerar que la recarga anterior es de "ahora mismo". Si el
// usuario vuelve a tropezar días después, tiene derecho a otra recarga.
const VENTANA_MS = 30_000;

/** True si ya recargamos hace nada por este mismo motivo. */
function recargaReciente(): boolean {
  try {
    const t = Number(sessionStorage.getItem(MARCA) ?? 0);
    return t > 0 && Date.now() - t < VENTANA_MS;
  } catch {
    // Sin sessionStorage (modo privado en algún navegador) no hay forma de
    // saberlo; se prefiere NO recargar antes que arriesgar un bucle.
    return true;
  }
}

function anotarRecarga(): void {
  try {
    sessionStorage.setItem(MARCA, String(Date.now()));
  } catch {
    /* si no se puede anotar, la comprobación de arriba ya impide el bucle */
  }
}

/** Borra la marca. Se llama cuando una carga va bien: el problema se resolvió. */
export function olvidarRecarga(): void {
  try {
    sessionStorage.removeItem(MARCA);
  } catch {
    /* noop */
  }
}

/** Parámetro con el que se rompe la caché. Se limpia en cuanto la app arranca. */
const PARAM_RECARGA = "_r";

/**
 * Recarga trayéndose el index.html de verdad, no el que el navegador tenga
 * guardado.
 *
 * `location.reload()` NO basta, y costó un caso real: un usuario con la pestaña
 * abierta desde hacía días seguía viendo la v4.5 después de recargar, con la
 * v6.8 ya desplegada. El HTML se sirve con `must-revalidate`, pero eso no
 * impide que Chrome en Android lo resuelva desde su caché o restaure la pestaña
 * congelada. Y si vuelve el mismo index viejo, vuelve a faltar el mismo trozo:
 * la recarga no arregla nada y encima gasta el único intento.
 *
 * Con un parámetro distinto en la URL, el navegador no tiene ninguna copia que
 * reutilizar y se ve obligado a pedirlo.
 */
export function recargarSaltandoCache(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM_RECARGA, Date.now().toString(36));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

/**
 * Quita de la barra de direcciones el parámetro de la recarga.
 *
 * Es cosmético pero importa: sin esto, la URL que el usuario copia o guarda en
 * favoritos se lleva un `?_r=lx3k9f` pegado para siempre.
 */
export function limpiarMarcaDeRecarga(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PARAM_RECARGA)) return;
    url.searchParams.delete(PARAM_RECARGA);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    /* noop */
  }
}

/**
 * Como `lazy()`, pero si el módulo no se puede descargar recarga la página una
 * vez para coger la versión desplegada.
 */
export function cargaDiferida<T extends ComponentType<unknown>>(
  importar: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const modulo = await importar();
      olvidarRecarga();
      return modulo;
    } catch (error) {
      if (recargaReciente()) throw error;
      anotarRecarga();
      recargarSaltandoCache();
      // La página se está yendo: no resolvemos para que React no pinte nada
      // entre medias (ni el error, ni un componente a medio cargar).
      return new Promise<{ default: T }>(() => {});
    }
  });
}

/**
 * Mismo problema, otra vía: Vite precarga trozos con <link rel="modulepreload">
 * y avisa con `vite:preloadError` cuando uno falla. Sin esto, el fallo puede
 * aparecer antes de que se llegue a evaluar el `import()` de arriba.
 */
export function vigilarPrecargas(): void {
  window.addEventListener("vite:preloadError", (evento) => {
    if (recargaReciente()) return;
    evento.preventDefault();
    anotarRecarga();
    recargarSaltandoCache();
  });
}
