// Lo que jsdom no trae y los componentes necesitan para montarse.
//
// Este bloque estaba COPIADO en 28 archivos de prueba, con cuatro variantes
// ligeramente distintas del mismo `matchMedia` y un `as any` por cada línea
// (unos 98 de los errores de lint del repo salían de aquí). Al vivir en un solo
// sitio se tipa una vez, se corrige una vez, y una prueba nueva no tiene que
// acordarse de qué hay que parchear.
//
// Por qué hace falta cada uno:
//  · ResizeObserver / IntersectionObserver — Radix y los carruseles miden el
//    DOM al montarse; sin ellos, reventar es lo primero que hacen.
//  · matchMedia — los hooks que distinguen móvil de escritorio.
//  · hasPointerCapture / releasePointerCapture / scrollIntoView — Radix los
//    llama al abrir un Select o un Dialog.
//  · URL.createObjectURL — la previsualización de una foto recién elegida.

interface ObservadorFalso {
  observe(): void;
  unobserve(): void;
  disconnect(): void;
}

const observadorInerte = class implements ObservadorFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/** Consulta de medios que siempre dice que no, que es el escritorio por defecto. */
const consultaFalsa = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

/**
 * Deja el DOM de jsdom en condiciones de montar la app.
 *
 * Se llama dentro de un `beforeEach`. Es idempotente y no pisa lo que el
 * entorno ya traiga, así que una prueba puede seguir poniendo su propio doble
 * después (por ejemplo un `matchMedia` que sí responda a un ancho concreto).
 */
export function prepararDom(): void {
  // Se pasa por `unknown`: el doble no implementa la interfaz entera del DOM
  // (root, rootMargin, takeRecords…), y no hace falta — lo único que se le pide
  // es no reventar cuando un componente lo instancia.
  const global = globalThis as unknown as Record<string, unknown>;
  global.ResizeObserver ??= observadorInerte;
  global.IntersectionObserver ??= observadorInerte;

  if (typeof window !== "undefined" && !window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: consultaFalsa,
    });
  }

  const elemento = Element.prototype as Element & {
    hasPointerCapture?: (id: number) => boolean;
    releasePointerCapture?: (id: number) => void;
    scrollIntoView?: () => void;
  };
  elemento.hasPointerCapture ??= () => false;
  elemento.releasePointerCapture ??= () => {};
  elemento.scrollIntoView ??= () => {};

  const url = URL as typeof URL & { createObjectURL?: (o: unknown) => string };
  url.createObjectURL ??= () => "blob:mock";
}
