import { useCallback, useLayoutEffect, useState } from "react";

/**
 * Cuántos elementos de un ancho mínimo caben en una fila.
 *
 * Repite la cuenta que hace CSS con `repeat(auto-fill, minmax(min, 1fr))`: n
 * columnas ocupan `n*min + (n-1)*gap`, así que caben `(ancho + gap) / (min + gap)`.
 * Va aparte del hook para poder probarla sin navegador: jsdom no calcula medidas.
 */
export function columnsThatFit(containerWidth: number, minWidth: number, gap: number): number {
  if (!(containerWidth > 0)) return 1;
  return Math.max(1, Math.floor((containerWidth + gap) / (minWidth + gap)));
}

/**
 * Mide un contenedor y dice cuántas tarjetas entran en UNA fila.
 *
 * Se usa en la portada para no dejar nunca una fila a medias: se muestran los
 * avisos que quepan y punto. No sirve `useIsMobile`/`matchMedia` porque lo que
 * manda es el ancho del contenedor, no el de la ventana.
 *
 * `fallback` se conserva mientras no haya una medida válida (render inicial sin
 * layout, o entorno de pruebas): calcular sobre un ancho 0 dejaría una sola
 * tarjeta en pantalla.
 */
export function useFittingCount(minWidth: number, gap: number, fallback: number) {
  // Referencia por callback y no `useRef`: la rejilla no existe en el primer
  // render (mientras no hay avisos se pinta el bloque de "sin avisos"), así que
  // un efecto atado solo a [minWidth, gap] mediría una referencia vacía y jamás
  // volvería a intentarlo. Guardando el nodo en estado, la medición ocurre en
  // cuanto aparece.
  const [nodo, setNodo] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => setNodo(el), []);
  const [count, setCount] = useState(fallback);

  // useLayoutEffect y no useEffect: se mide antes de pintar, así no se ve el
  // salto de `fallback` tarjetas a las que de verdad caben.
  useLayoutEffect(() => {
    if (!nodo) return;

    const medir = () => {
      const ancho = nodo.clientWidth;
      if (ancho > 0) setCount(columnsThatFit(ancho, minWidth, gap));
    };
    medir();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [nodo, minWidth, gap]);

  return { ref, count };
}
