// El marco de la tarjeta de un aviso, en un solo sitio.
//
// Lo comparten las TRES vistas del mismo aviso: la cuadrícula del buscador, la
// lista, y la ficha que sale al pulsar un pin del mapa. Estaba escrito a mano en
// cada una y ya habían empezado a divergir — la del mapa ni siquiera tenía
// marco.
//
// Vive en `lib` y no junto al componente porque un archivo que exporta
// componentes no puede exportar además constantes sin romper el refresco en
// caliente de Vite (react-refresh/only-export-components).

/**
 * Clases del marco según si el aviso está destacado.
 *
 * El dorado carga SOLO con el peso de la distinción desde que se le retiró el
 * icono: es lo único que separa un aviso pagado del resto. Por eso va con fondo
 * sólido, borde saturado y halo, y no con el fondo al 50 % de opacidad y el
 * borde amber-400 de antes, que sobre blanco se leían como un matiz.
 *
 * `conHalo` en false para la vista de lista, donde las filas van pegadas y el
 * anillo exterior se comería la separación.
 */
export function marcoDeAviso(featured: boolean, conHalo = true): string {
  if (!featured) return "bg-card border border-border/70 hover:border-secondary/40";
  const halo = conHalo ? " ring-2 ring-amber-400/40 shadow-md shadow-amber-500/20 hover:shadow-amber-500/40" : "";
  return `bg-amber-50 border-2 border-amber-500 hover:border-amber-600${halo}`;
}
