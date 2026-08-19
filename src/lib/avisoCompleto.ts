// ¿Le falta algo al aviso para poder publicarse?
//
// Guardar un borrador solo exige título y categoría, y así debe ser: un
// borrador es "guárdame lo que llevo". Publicarlo es otra cosa — sale al
// público y se cobra— y ahí valen las mismas reglas que en el formulario.
//
// Vivían solo dentro de `AdvertiserPublish`, así que el camino "publicar desde
// Mis avisos › Borradores" se las saltaba entero: cobraba y publicaba un aviso
// sin descripción, sin precio y sin ubicación. Aquí están una sola vez, para
// que los dos caminos exijan lo mismo.

/** Lo mínimo que hace falta mirar de un aviso. */
export interface AvisoParaPublicar {
  category?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | null;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
  country?: string | null;
}

export interface DatoQueFalta {
  /** Campo al que llevar al usuario (mismo `data-campo` del formulario). */
  campo: "categoria" | "titulo" | "descripcion" | "precio" | "ubicacion";
  mensaje: string;
}

/** Los empleos pueden publicarse sin sueldo: "a convenir" es lo normal ahí. */
const CATEGORIA_EMPLEOS = "empleos";

/**
 * El primer dato que falta, en el orden en que aparecen en el formulario, o
 * null si el aviso está listo.
 *
 * Un precio de 0 es válido: sale como "Precio a convenir". Lo que no vale es
 * un precio negativo ni, fuera de empleos, no haber puesto ninguno.
 */
export function faltaEnElAviso(aviso: AvisoParaPublicar): DatoQueFalta | null {
  const categoria = (aviso.category ?? "").trim();
  if (!categoria) {
    return { campo: "categoria", mensaje: "Elige la categoría de tu aviso." };
  }
  if (!(aviso.title ?? "").trim()) {
    return { campo: "titulo", mensaje: "Ponle un título a tu aviso." };
  }
  if (!(aviso.description ?? "").trim()) {
    return { campo: "descripcion", mensaje: "Describe lo que ofreces: sin descripción, el aviso no convence a nadie." };
  }

  const precio = aviso.price;
  if (typeof precio === "number" && precio < 0) {
    return { campo: "precio", mensaje: "El precio no puede ser negativo." };
  }
  if (categoria !== CATEGORIA_EMPLEOS && (precio === null || precio === undefined)) {
    return { campo: "precio", mensaje: "Indica el precio del producto." };
  }

  // Dentro del Perú la ubicación se marca en el mapa (de ahí salen lat/lng);
  // fuera basta el texto, que es lo que decidió el cliente al abrir países.
  const esPeru = (aviso.country ?? "PE").trim().toUpperCase() === "PE";
  const tieneTexto = !!(aviso.location ?? "").trim();
  const tienePunto = aviso.lat !== null && aviso.lat !== undefined
    && aviso.lng !== null && aviso.lng !== undefined;
  if (esPeru ? !(tieneTexto && tienePunto) : !tieneTexto) {
    return {
      campo: "ubicacion",
      mensaje: esPeru
        ? "Marca la ubicación de tu aviso en el mapa."
        : "Escribe la ciudad o referencia de tu aviso.",
    };
  }

  return null;
}
