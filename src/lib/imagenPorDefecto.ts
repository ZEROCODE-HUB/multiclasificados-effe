// La imagen que se muestra en los avisos SIN FOTO, configurable desde el panel.
//
// EL PROBLEMA QUE RESUELVE. Quien la necesita es `mapCard()` (src/lib/listings
// .ts), que es una función pura y SÍNCRONA por la que pasa casi toda la app:
// portada, búsqueda, mapa, favoritos. No puede esperar a la base de datos.
//
// Se resuelve igual que las categorías (src/lib/categories.ts): un valor en
// memoria con copia en el navegador, un lector síncrono que siempre devuelve
// algo, y una carga en segundo plano que lo actualiza.
//
// LA RED DE SEGURIDAD. Si no hay ninguna configurada, si aún no ha cargado o si
// la consulta falla, se devuelve la imagen que va dentro del bundle. Un aviso
// nunca se queda sin imagen por un problema de red o de configuración.
import { supabase } from "@/lib/supabase";

/**
 * La imagen de un aviso publicado sin foto: la que va DENTRO del bundle.
 *
 * Subir foto es opcional, así que esto no es un caso raro: es lo que verá
 * cualquiera que publique deprisa. Antes era una foto de archivo de un edificio
 * de oficinas traída de Unsplash, que además de no decir nada dependía de un
 * servidor ajeno; ahora es la marca, servida desde el propio dominio.
 *
 * El archivo se genera con scripts/generar-imagen-por-defecto.mjs.
 *
 * Desde la migración 0093 el panel puede poner otra encima; esta se queda como
 * último recurso y por eso sigue siendo una ruta local: es lo único que está
 * garantizado que existe aunque no haya red.
 */
export const FALLBACK_IMG = "/aviso-sin-imagen.jpg";

const STORAGE_KEY = "effe:imagen-por-defecto";

let cache: string | null = null;
let cargado = false;
let enCurso: Promise<string> | null = null;
const oyentes = new Set<() => void>();

function leerSnapshot(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    // Solo se acepta lo que puede ir en un <img src>. Un valor corrupto en el
    // navegador no debe dejar la portada con imágenes rotas.
    return v && /^(https?:\/\/|\/)/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function guardarSnapshot(url: string | null) {
  try {
    if (url) localStorage.setItem(STORAGE_KEY, url);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* modo privado o cuota llena: la copia es opcional */
  }
}

/**
 * Lectura SÍNCRONA. Es la que usan `mapCard` y la vista previa de publicar, así
 * que nunca devuelve vacío: si no hay nada, la imagen del bundle.
 */
export function imagenPorDefecto(): string {
  if (cache === null && !cargado) cache = leerSnapshot();
  return cache || FALLBACK_IMG;
}

export function suscribirImagenPorDefecto(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  return () => { oyentes.delete(alCambiar); };
}

/**
 * Trae la configurada desde la base de datos.
 *
 * Usa la función `default_listing_image()`, que está concedida a `anon`: un
 * visitante sin cuenta también tiene que verla. `get_settings()` no vale, que
 * filtra por staff.
 */
export async function cargarImagenPorDefecto(forzar = false): Promise<string> {
  if (cargado && !forzar) return imagenPorDefecto();
  if (enCurso) return enCurso;

  enCurso = (async () => {
    try {
      const { data, error } = await supabase.rpc("default_listing_image");
      if (error) throw error;
      const url = typeof data === "string" && data.trim() ? data.trim() : null;
      cache = url;
      cargado = true;
      guardarSnapshot(url);
      oyentes.forEach((o) => o());
    } catch {
      /* sin red o sin la migración aplicada: se queda lo que hubiera */
    }
    enCurso = null;
    return imagenPorDefecto();
  })();

  return enCurso;
}

/** Tras cambiarla en el panel: relee y avisa a toda la app. */
export function invalidarImagenPorDefecto(): Promise<string> {
  cargado = false;
  return cargarImagenPorDefecto(true);
}

/** Solo para pruebas: vuelve al estado inicial. */
export function reiniciarImagenPorDefecto(): void {
  cache = null;
  cargado = false;
  enCurso = null;
  oyentes.clear();
}
