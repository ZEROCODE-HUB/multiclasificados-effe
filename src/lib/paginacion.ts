// Cálculos de paginación. Son funciones puras: no pintan nada y no dependen
// de React, así que viven aquí y no colgando del componente de la página.
/**
 * Cuántos avisos poner en una página para que no quede una fila a medias.
 *
 * Con un número fijo, la última fila se rompe casi siempre: 20 avisos en una
 * rejilla de 6 columnas son 3 filas llenas y 2 sueltos, con cuatro huecos al
 * final de la página. Se redondea al múltiplo del número de columnas más
 * cercano al objetivo, así que la página cuadra a cualquier ancho.
 *
 * Nunca devuelve 0: con más columnas que el objetivo, sale una fila completa.
 */
export function pageSizeParaColumnas(objetivo: number, columnas: number): number {
  const cols = Math.max(1, Math.floor(columnas));
  return cols * Math.max(1, Math.round(objetivo / cols));
}

// Números de página a mostrar, con "…" cuando hay muchas. Siempre incluye la
// primera, la última y una ventana alrededor de la actual.
export function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push("…");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
}
