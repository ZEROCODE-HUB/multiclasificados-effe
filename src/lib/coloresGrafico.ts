// Colores de los gráficos del panel.
//
// Vive fuera de la pantalla por dos motivos: exportar una función desde un
// archivo de componentes rompe la recarga rápida de Vite, y el panel tiene más
// de un gráfico de categorías (el del inicio y el de Reportes) que deberían
// pintar la misma categoría del mismo color.

/** Paleta de marca. Los primeros trozos del gráfico salen de aquí. */
export const COLORS = [
  "hsl(220 56% 20%)",
  "hsl(24 95% 53%)",
  "hsl(166 60% 45%)",
  "hsl(220 56% 45%)",
  "hsl(40 95% 55%)",
  "hsl(220 14% 60%)",
];

/**
 * Color del trozo `i` de un gráfico de sectores.
 *
 * Los seis primeros son los de la marca. A partir de ahí se GENERAN, porque
 * repetir la paleta —que es lo que se hacía— pinta dos categorías del mismo
 * color: con quince, el gráfico dejaba de poder leerse por muy bien que
 * estuviera la leyenda.
 *
 * El tono avanza 137,5°, el ángulo áureo. Es la forma conocida de repartir
 * colores sin que se agrupen ni vuelvan a caer donde ya hay uno: con cualquier
 * divisor "redondo" (90°, 120°) el cuarto o el tercero repiten. La luminosidad
 * alterna para que dos trozos contiguos no se confundan ni con el tono parecido.
 */
export function colorDeTrozo(i: number): string {
  if (i < COLORS.length) return COLORS[i];
  const tono = Math.round((i * 137.5) % 360);
  return `hsl(${tono} 55% ${i % 2 === 0 ? 45 : 62}%)`;
}
