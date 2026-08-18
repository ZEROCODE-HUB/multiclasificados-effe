// Vídeos de un aviso: hasta tres, de veinte segundos.
//
// La duración solo se puede comprobar aquí, en el navegador, leyendo los
// metadatos del archivo: el servidor tendría que decodificarlo para saberlo. Es
// una validación de buena fe, y por eso el bucket lleva además un tope de
// tamaño y una lista de tipos permitidos, que sí se aplican del lado del
// servidor pase lo que pase.

export const MAX_VIDEOS = 3;
export const MAX_SEGUNDOS = 20;
export const MAX_BYTES = 15 * 1024 * 1024; // 15 MB: sobra para 20 s de móvil
export const MIME_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];

// Los codificadores redondean hacia arriba: un vídeo grabado a 20 s puede
// declarar 20,2. Rechazarlo sería incomprensible para quien lo grabó.
const TOLERANCIA_S = 0.5;

/** Cuánto dura el vídeo, en segundos. Rechaza si no se puede saber. */
export function leerDuracionDeVideo(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";

    const limpiar = () => {
      el.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
    // Algunos formatos no disparan ningún evento en ciertos navegadores: sin
    // este corte, elegir un archivo raro dejaría la pantalla esperando siempre.
    const corte = setTimeout(() => { limpiar(); reject(new Error("tiempo agotado")); }, 10_000);

    el.onloadedmetadata = () => {
      clearTimeout(corte);
      const d = el.duration;
      limpiar();
      // Los WebM sin índice devuelven Infinity: no se puede saber cuánto duran.
      if (!Number.isFinite(d) || d <= 0) reject(new Error("duración desconocida"));
      else resolve(d);
    };
    el.onerror = () => { clearTimeout(corte); limpiar(); reject(new Error("no se pudo leer el vídeo")); };
    el.src = url;
  });
}

export type ValidacionVideo =
  | { ok: true; duracion: number }
  | { ok: false; motivo: string };

/** Comprueba tipo, tamaño y duración. El motivo es lo que se le enseña al usuario. */
export async function validarVideo(file: File): Promise<ValidacionVideo> {
  if (file.type && !MIME_VIDEO.includes(file.type)) {
    return { ok: false, motivo: "El archivo debe ser un video MP4, MOV o WebM." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, motivo: `El video supera los ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Graba uno más corto o con menos calidad.` };
  }
  try {
    const duracion = await leerDuracionDeVideo(file);
    if (duracion > MAX_SEGUNDOS + TOLERANCIA_S) {
      return { ok: false, motivo: `El video dura ${Math.round(duracion)} s y el máximo son ${MAX_SEGUNDOS} s.` };
    }
    return { ok: true, duracion };
  } catch {
    return { ok: false, motivo: "No pudimos leer la duración de este video. Prueba a subirlo en MP4." };
  }
}
