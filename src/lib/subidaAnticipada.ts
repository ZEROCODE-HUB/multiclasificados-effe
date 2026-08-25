// Subir los adjuntos de un aviso MIENTRAS se rellena el formulario, no al pulsar
// "Publicar".
//
// El porqué, con números medidos: al publicar un aviso completo se suben hasta
// 1,2 MB de fotos y hasta 46 MB de vídeo, y todo eso empezaba en el clic del
// botón. En una conexión móvil peruana son de dos a seis minutos mirando un
// botón que no se mueve. Pero la foto se elige en el minuto uno y "Publicar" se
// pulsa en el minuto cuatro: hay tres minutos de subida gratis que no se
// aprovechaban. Usándolos, al llegar al botón no queda nada que subir.
//
// Lo que NO se puede hacer, y conviene tenerlo claro antes de pedirlo: seguir
// subiendo cuando el usuario cierra la pestaña o mata la app. El archivo solo
// existe en su dispositivo; el servidor nunca lo tuvo, así que no hay nada que
// "terminar por detrás". Lo que sí se hace es no perder lo ya subido: al volver,
// el aviso conserva su identificador y los archivos que llegaron sigue estando.
//
// La clave del diseño: el identificador del aviso se genera EN EL NAVEGADOR
// antes de que exista la fila en la base de datos. Así la ruta de Storage es
// desde el primer momento la definitiva —`<usuario>/<aviso>/…`, la misma de
// siempre—, sin carpetas temporales que luego haya que mover ni limpiar, y sin
// tener que crear un borrador en "Mis avisos" solo para poder subir una foto.
import { supabase, supabaseUrl } from "@/lib/supabase";

/** Dónde acabó un archivo ya subido. */
export interface AdjuntoSubido {
  /** Ruta dentro del bucket. Es lo que se guarda en la base de datos. */
  path: string;
  /** URL pública (vacía en los buckets privados, como el de documentos). */
  url: string;
}

export type EstadoSubida =
  | { fase: "espera" }
  | { fase: "subiendo" }
  | { fase: "lista"; subido: AdjuntoSubido }
  | { fase: "error"; motivo: string };

const BUCKET_IMAGENES = "listing-images";
const BUCKET_VIDEOS = "listing-videos";
const BUCKET_DOCS = "listing-docs";

/**
 * Identificador de aviso nuevo.
 *
 * `crypto.randomUUID` no existe en contextos no seguros (http:// que no sea
 * localhost) ni en WebViews antiguos, y ahí devolver undefined rompería la ruta
 * entera. La alternativa no necesita ser criptográfica: solo irrepetible.
 */
export function nuevoIdDeAviso(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  // Último recurso. Solo se llega aquí en entornos sin API de aleatoriedad.
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
}

/**
 * Extensión con la que guardar el archivo.
 *
 * Se saca del tipo y no del nombre: una foto que entró como `.jpg` sale del
 * optimizador convertida en WebP, y guardarla con la extensión vieja hace que
 * algunos navegadores se nieguen a pintarla.
 */
function extensionDe(file: File): string {
  const porTipo: Record<string, string> = {
    "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
    "application/pdf": "pdf",
  };
  const t = porTipo[file.type];
  if (t) return t;
  const delNombre = /\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1];
  return (delNombre || "bin").toLowerCase();
}

/**
 * Ruta de un adjunto.
 *
 * `ranura` es el hueco que ocupa (portada, imagen 2, vídeo 1…), NO el nombre del
 * archivo: así, cambiar la foto de un hueco SOBRESCRIBE la anterior en vez de
 * dejarla ocupando sitio para siempre. El primer tramo tiene que ser el id del
 * usuario porque es lo único que comprueba la regla del bucket.
 */
function rutaDe(userId: string, listingId: string, ranura: string, file: File): string {
  return `${userId}/${listingId}/${ranura}.${extensionDe(file)}`;
}

const BUCKET_DE: Record<"imagen" | "video" | "pdf", string> = {
  imagen: BUCKET_IMAGENES,
  video: BUCKET_VIDEOS,
  pdf: BUCKET_DOCS,
};

/**
 * Subida REANUDABLE, para los archivos que pesan de verdad (los vídeos).
 *
 * La subida normal es todo o nada: si se corta al 80 % de un vídeo de 15 MB,
 * el reintento vuelve a empezar por cero. En una conexión móvil peruana eso pasa
 * a menudo, y con tres vídeos el usuario puede quedarse sin llegar nunca al
 * final. El protocolo TUS —que Supabase Storage habla de serie— retoma por donde
 * iba en vez de repetirlo todo.
 *
 * La librería se carga SOLO al subir un vídeo (`import()` dinámico): quien no
 * usa el adicional de vídeo, que son casi todos, no descarga ni un byte de esto.
 * Y el trozo tiene que ser de 6 MB exactos: es lo que exige el servidor de
 * Supabase, no una elección.
 */
const TROZO_TUS = 6 * 1024 * 1024;

async function subirReanudable(
  bucket: string,
  path: string,
  file: File,
  signal?: AbortSignal,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("sin sesión");

  const { Upload } = await import("tus-js-client");

  await new Promise<void>((resolve, reject) => {
    const subida = new Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 6000, 12000],
      headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
      uploadDataDuringCreation: true,
      // Sin esto, dos vídeos distintos con el mismo nombre se pisarían al
      // buscar una subida a medias que retomar.
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "2592000",
      },
      chunkSize: TROZO_TUS,
      onError: reject,
      onSuccess: () => resolve(),
    });

    const cancelar = () => { void subida.abort(); reject(new Error("cancelada")); };
    if (signal?.aborted) { cancelar(); return; }
    signal?.addEventListener("abort", cancelar, { once: true });

    // Si hay una subida de este mismo archivo a medias, se retoma; si no, empieza.
    void subida.findPreviousUploads().then((previas) => {
      if (previas.length) subida.resumeFromPreviousUpload(previas[0]);
      subida.start();
    });
  });
}

/**
 * Sube UN adjunto y devuelve dónde quedó.
 *
 * Se reintenta una vez: en móvil, el primer intento se pierde a menudo al
 * cambiar de antena o al volver de segundo plano, y reintentar sale mucho más
 * barato que hacer que el usuario vuelva a elegir el archivo.
 */
export async function subirAdjunto(
  tipo: "imagen" | "video" | "pdf",
  userId: string,
  listingId: string,
  ranura: string,
  file: File,
  // `signal` conserva el nombre de la API del navegador (AbortSignal): traducirlo
  // solo obligaría a acordarse de la traducción en cada llamada.
  opciones?: { signal?: AbortSignal },
): Promise<AdjuntoSubido> {
  const bucket = BUCKET_DE[tipo];
  const path = rutaDe(userId, listingId, ranura, file);

  // Un vídeo pesa hasta 15 MB: va por la vía reanudable, que retoma en vez de
  // repetir. Si esa vía falla por lo que sea (la librería no carga, el servidor
  // no acepta el protocolo), se sigue por la de siempre: es preferible una
  // subida lenta a un adjunto que no llega.
  if (tipo === "video") {
    try {
      await subirReanudable(bucket, path, file, opciones?.signal);
      return { path, url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
    } catch (e) {
      if (opciones?.signal?.aborted) throw e;
      console.warn("[subida] La vía reanudable falló, se sube del tirón:", e);
    }
  }

  let ultimo: string | null = null;
  for (let intento = 0; intento < 2; intento++) {
    if (opciones?.signal?.aborted) throw new Error("cancelada");
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      cacheControl: "2592000",
      contentType: file.type || undefined,
    });
    if (!error) {
      // El bucket de documentos es privado: su URL pública no sirve para nada y
      // se pide firmada en el momento de abrirla.
      const url = tipo === "pdf"
        ? ""
        : supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      return { path, url };
    }
    ultimo = error.message;
  }
  throw new Error(ultimo ?? "No se pudo subir el archivo.");
}

/** Borra un adjunto que ya no se va a usar. Un huérfano no rompe nada: no se propaga el fallo. */
export async function borrarAdjunto(tipo: "imagen" | "video" | "pdf", path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET_DE[tipo]).remove([path]);
  } catch {
    /* Que quede un archivo suelto es mucho menos grave que romper el formulario. */
  }
}

/**
 * Cuánto queda por subir, en bytes.
 *
 * El progreso se cuenta por PESO y no por número de archivos a propósito: con
 * "subiendo 1 de 4" un vídeo de 15 MB y una foto de 200 KB valen lo mismo, y la
 * barra se queda clavada en el 25% durante minutos.
 */
export function bytesPendientes(
  adjuntos: Array<{ file: File; estado: EstadoSubida }>,
): { hechos: number; total: number } {
  let hechos = 0;
  let total = 0;
  for (const a of adjuntos) {
    total += a.file.size;
    if (a.estado.fase === "lista") hechos += a.file.size;
  }
  return { hechos, total };
}

/** Porcentaje redondeado, 0-100. Sin nada que subir es 100: no hay nada pendiente. */
export function porcentajeSubido(adjuntos: Array<{ file: File; estado: EstadoSubida }>): number {
  const { hechos, total } = bytesPendientes(adjuntos);
  if (total === 0) return 100;
  return Math.min(100, Math.round((hechos / total) * 100));
}

/**
 * Lo que falta por subir, en texto para el usuario. `null` = no enseñar nada.
 *
 * Solo habla si hay algo VIAJANDO ahora mismo. Un adjunto en "espera" —el caso
 * de quien todavía no inició sesión, donde no se puede subir nada porque no hay
 * ruta— no es una subida en curso: enseñarlo dejaba un "terminando de subir…"
 * eterno debajo de un botón que en realidad estaba listo. Lo que falló tampoco
 * cuenta: publicar lo reintenta, y no hay nada que el usuario deba hacer.
 */
export function textoDePendiente(adjuntos: Array<{ file: File; estado: EstadoSubida }>): string | null {
  const enVuelo = adjuntos.filter((a) => a.estado.fase === "subiendo");
  if (!enVuelo.length) return null;
  const mb = enVuelo.reduce((t, a) => t + a.file.size, 0) / (1024 * 1024);
  if (mb >= 1) return `Faltan ${mb.toFixed(1)} MB por subir`;
  return "Terminando de subir…";
}
