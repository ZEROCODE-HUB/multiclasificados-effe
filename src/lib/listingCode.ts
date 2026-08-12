// Código corto y legible de un aviso, el que se le enseña al usuario ("EFFE-…")
// y que menciona al llamar por teléfono.
//
// Vive aparte porque se pinta en dos sitios de la ficha (la tabla de datos y el
// diálogo del teléfono) y ambos TIENEN que dar lo mismo: si no coinciden, quien
// llama dicta un código que el anunciante no encuentra.
//
// Antes era `id.padStart(6, "0")`, que da por supuesto un id numérico corto. Los
// ids reales son UUID, así que el código salía siendo el UUID entero
// ("EFFE-01e6d187-aa3f-448d-802f-a69c17900d0c"): 41 caracteres, ilegibles de
// dictar y suficientes para romper el ancho de la fila.

/**
 * Devuelve el código visible del aviso a partir de su id.
 *
 * Con un UUID usa sus 8 primeros caracteres sin guiones, en mayúsculas: son
 * 4.300 millones de combinaciones, de sobra para identificar un aviso en una
 * llamada (y el buscador del panel sigue trabajando con el id completo).
 * Con los ids cortos de los avisos de demostración ("1", "2") mantiene el
 * relleno con ceros de siempre, para no cambiarles el código.
 */
export function codigoDeAviso(id: string): string {
  return `EFFE-${id.replace(/-/g, "").slice(0, 8).toUpperCase().padStart(6, "0")}`;
}
