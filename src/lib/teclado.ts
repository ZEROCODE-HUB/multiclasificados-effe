// El teclado del móvil: cerrarlo cuando toca, y que no se quede encima.
//
// En una página web el teclado se cierra solo al perder el foco, pero en un
// móvil eso casi nunca pasa: se busca, se pulsa Enter, llegan los resultados…
// y el teclado sigue tapando media pantalla. Y al tocar fuera para quitarlo, el
// toque activa lo que hubiera debajo en vez de cerrarlo.
import { Capacitor } from "@capacitor/core";

/** ¿Este elemento escribe texto? Es lo que decide si el teclado está en juego. */
export function esCampoDeTexto(el: Element | null | undefined): boolean {
  if (!el) return false;
  const nodo = el as HTMLElement;
  if (nodo.isContentEditable) return true;
  const tag = nodo.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  // Los que NO abren teclado (casillas, botones, selectores de archivo) no
  // cuentan: cerrar "el teclado" al tocar una casilla no significa nada.
  const tipo = (nodo as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(tipo);
}

/**
 * Cierra el teclado del móvil.
 *
 * El `blur` basta en web; en el APK/IPA hace falta además decírselo al plugin,
 * porque el WebView puede mantenerlo abierto aunque ningún campo tenga el foco.
 * Es seguro llamarla en web y en escritorio: allí no hay teclado que cerrar y
 * el blur no molesta a nadie.
 */
export function cerrarTeclado(): void {
  const activo = document.activeElement as HTMLElement | null;
  if (esCampoDeTexto(activo)) activo?.blur();

  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      const { Keyboard } = await import("@capacitor/keyboard");
      await Keyboard.hide();
    } catch {
      // Sin el plugin (build sin sincronizar) el blur ya ha hecho su parte.
    }
  })();
}

/**
 * ¿Hay un teclado que cerrar? Mismo criterio que `share.ts`: puntero grueso.
 * En escritorio no hay teclado en pantalla, así que nada de esto aplica y
 * tragarse un clic allí solo sería una rareza.
 */
function esTactil(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
}

/** Controles que sí quieren el toque: ahí no se traga el clic. */
const INTERACTIVO = 'button, a[href], input, select, textarea, label, summary,' +
  ' [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"],' +
  ' [role="switch"], [role="checkbox"], [role="radio"], [contenteditable="true"]';

/**
 * Un toque fuera del campo cierra el teclado, como en cualquier app.
 *
 * Dos detalles que lo hacen funcionar de verdad:
 *
 *  1. Se escucha `pointerdown`, no `click`. Al cerrarse el teclado la página
 *     recupera media pantalla y TODO se mueve hacia abajo; si esperáramos al
 *     `click`, para entonces el dedo estaría sobre otra cosa. Es exactamente lo
 *     que se veía: tocabas al aire y se activaba un elemento.
 *  2. Si el toque cae al aire, el clic que viene detrás se descarta: ese toque
 *     era para quitar el teclado y nada más. Pero si cae sobre un botón o un
 *     enlace, el clic pasa intacto — que buscar y pulsar "Buscar" exija dos
 *     toques sería peor que el problema.
 *
 * Devuelve la función para dejar de escuchar.
 */
export function cerrarTecladoAlTocarFuera(): () => void {
  const alTocar = (e: PointerEvent) => {
    if (!esTactil()) return;
    const activo = document.activeElement as HTMLElement | null;
    if (!esCampoDeTexto(activo)) return;

    const destino = e.target as HTMLElement | null;
    if (!destino) return;
    // Tocar el propio campo (o su etiqueta) no lo cierra, faltaría más.
    if (esCampoDeTexto(destino)) return;

    const sobreUnControl = !!destino.closest(INTERACTIVO);
    if (sobreUnControl) {
      // El clic manda. El teclado se cerrará solo si ese control lo pide
      // (`cerrarTeclado` en el submit del buscador, por ejemplo): cerrarlo
      // aquí movería el botón justo antes de que el dedo lo alcance.
      return;
    }

    activo?.blur();
    cerrarTeclado();

    const tragarClic = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    document.addEventListener("click", tragarClic, { capture: true, once: true });
    // Si el toque no acaba en clic (un scroll, por ejemplo), el listener se
    // quedaría esperando y se comería el clic siguiente, que sí es legítimo.
    window.setTimeout(
      () => document.removeEventListener("click", tragarClic, { capture: true }),
      500,
    );
  };

  document.addEventListener("pointerdown", alTocar, true);
  return () => document.removeEventListener("pointerdown", alTocar, true);
}
