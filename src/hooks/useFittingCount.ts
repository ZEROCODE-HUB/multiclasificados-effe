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
 *
 * `minWidth` admite una FUNCIÓN del ancho medido, para rejillas cuyo mínimo
 * cambia por tramo (la portada usa 150 px en móvil y 230 en adelante). Tiene que
 * ser estable entre renders —declararla a nivel de módulo—, porque entra en las
 * dependencias del efecto: una función creada en el render mediría en bucle.
 */
export function useFittingCount(
  minWidth: number | ((containerWidth: number) => number),
  gap: number,
  fallback: number,
) {
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
      if (ancho <= 0) return;
      const min = typeof minWidth === "function" ? minWidth(ancho) : minWidth;
      setCount(columnsThatFit(ancho, min, gap));
    };
    medir();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [nodo, minWidth, gap]);

  return { ref, count };
}

/**
 * Cuántas columnas tiene de verdad una rejilla ya pintada.
 *
 * Se diferencia de `useFittingCount` en que NO supone `auto-fill`: el buscador
 * fija sus columnas por breakpoint (`md:grid-cols-3 … 2xl:grid-cols-6`), así que
 * repetir aquí la cuenta del ancho daría un número distinto del real. En vez de
 * eso se le pregunta al navegador, que es quien lo ha decidido; si mañana
 * cambian esas clases, esto sigue diciendo la verdad sin tocarlo.
 *
 * Devuelve 1 cuando el contenedor no es una rejilla (la vista de lista, donde
 * cada aviso ocupa su propia fila) y mientras no se pueda medir (jsdom).
 */
export function useGridColumns() {
  const [nodo, setNodo] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => setNodo(el), []);
  const [cols, setCols] = useState(1);

  useLayoutEffect(() => {
    if (!nodo || typeof getComputedStyle !== "function") return;

    const medir = () => {
      // "none" en la vista de lista y en jsdom (sin CSS real): una por fila.
      const pistas = getComputedStyle(nodo).gridTemplateColumns;
      if (!pistas || pistas === "none") { setCols(1); return; }
      setCols(Math.max(1, pistas.split(" ").filter(Boolean).length));
    };
    medir();

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [nodo]);

  return { ref, cols };
}
