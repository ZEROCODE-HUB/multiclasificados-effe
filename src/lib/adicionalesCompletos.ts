// ¿Está el aviso listo para publicarse, o falta lo que ya se contrató?
//
// Los adicionales se contratan ANTES de subir el archivo: uno elige "3 vídeos"
// y luego los sube. Si publica con dos huecos vacíos, paga por tres. En un
// aviso de 30 días a S/ 5 por día, eso son S/ 300 por nada.
//
// Aquí no se ajusta el precio a la baja a propósito: el usuario eligió el
// paquete y lo que hay que hacer es avisarle de que le falta subir algo, no
// cobrarle menos por lo bajo. Decisión del cliente, 19-ago-2026.
//
// Vive aparte de las dos pantallas que lo usan —el formulario de publicar y el
// diálogo de "Publicar" desde borradores— porque tienen los archivos en sitios
// distintos (en memoria uno, en la base el otro) y la regla tiene que ser la
// misma en los dos.

/** Lo que el usuario contrató en su paquete. */
export interface AdicionalesContratados {
  /** Imágenes ADICIONALES (sin contar la principal). */
  img500?: number;
  /** 1 = lleva PDF adjunto. */
  pdf500?: number;
  video20?: number;
  [otros: string]: number | undefined;
}

/** Lo que el aviso tiene de verdad. */
export interface AdjuntosDelAviso {
  imagenesExtra: number;
  tienePdf: boolean;
  videos: number;
}

export interface AdicionalFaltante {
  /** Clave del adicional, para marcar su casilla en la pantalla. */
  clave: "img500" | "pdf500" | "video20";
  contratados: number;
  subidos: number;
  /** Frase lista para enseñar, en singular o plural según toque. */
  mensaje: string;
}

const plural = (n: number, singular: string, plural_: string) =>
  `${n} ${n === 1 ? singular : plural_}`;

/**
 * Qué falta por subir de lo contratado. Lista vacía = se puede publicar.
 *
 * Solo mira los adicionales que llevan archivo: "urgente", "destacado" y
 * "confidencial" son etiquetas y no hay nada que subir.
 */
export function adicionalesQueFaltan(
  contratados: AdicionalesContratados | null | undefined,
  adjuntos: AdjuntosDelAviso,
): AdicionalFaltante[] {
  const c = contratados ?? {};
  const faltan: AdicionalFaltante[] = [];

  const imgs = Math.max(0, Number(c.img500) || 0);
  if (imgs > adjuntos.imagenesExtra) {
    const faltantes = imgs - adjuntos.imagenesExtra;
    faltan.push({
      clave: "img500",
      contratados: imgs,
      subidos: adjuntos.imagenesExtra,
      mensaje: `Contrataste ${plural(imgs, "imagen adicional", "imágenes adicionales")} y subiste ${adjuntos.imagenesExtra}. ` +
        `Sube ${plural(faltantes, "imagen más", "imágenes más")} o baja la cantidad.`,
    });
  }

  const pdf = Math.max(0, Number(c.pdf500) || 0);
  if (pdf > 0 && !adjuntos.tienePdf) {
    faltan.push({
      clave: "pdf500",
      contratados: 1,
      subidos: 0,
      mensaje: "Contrataste el PDF adjunto y no subiste ninguno. Súbelo o quita el adicional.",
    });
  }

  const vids = Math.max(0, Number(c.video20) || 0);
  if (vids > adjuntos.videos) {
    const faltantes = vids - adjuntos.videos;
    faltan.push({
      clave: "video20",
      contratados: vids,
      subidos: adjuntos.videos,
      mensaje: `Contrataste ${plural(vids, "video", "videos")} y subiste ${adjuntos.videos}. ` +
        `Sube ${plural(faltantes, "video más", "videos más")} o baja la cantidad.`,
    });
  }

  return faltan;
}

/** Resumen de una línea para el aviso emergente. */
export function resumenDeFaltantes(faltan: AdicionalFaltante[]): string {
  if (faltan.length === 0) return "";
  if (faltan.length === 1) return faltan[0].mensaje;
  return `Te falta subir ${faltan.length} adicionales que ya contrataste. ` +
    "Súbelos o baja la cantidad para no pagar de más.";
}
