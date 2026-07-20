// Redimensionado de imágenes al vuelo con las transformaciones de Supabase Storage.
//
// El problema: las fotos de los avisos se guardan tal cual las sube el usuario
// (hay originales de 1,6 MB) y se pintaban a tamaño completo en tarjetas de
// ~300 px. Solo la portada llegaba a pesar 3,5 MB en total.
//
// Supabase sirve una versión redimensionada cambiando `/object/public/` por
// `/render/image/public/` y añadiendo `width`. Además negocia el formato por la
// cabecera `Accept`, así que los navegadores modernos reciben WebP sin pedirlo.
// Medido sobre una foto real del proyecto: 1.657 KB -> 31 KB a width=400.
//
// Solo transformamos URLs de NUESTRO bucket: las externas (Unsplash de los
// avisos de ejemplo, o cualquier URL guardada en la BD) se devuelven intactas.
const PUBLIC_SEG = "/storage/v1/object/public/";
const RENDER_SEG = "/storage/v1/render/image/public/";

/**
 * Devuelve la URL de la imagen redimensionada al ancho pedido.
 * Si la URL no es de Supabase Storage, la devuelve sin tocar.
 */
export function imgUrl(url: string | null | undefined, width: number, quality = 78): string {
  if (!url) return "";

  // Avisos de ejemplo y respaldos apuntan a Unsplash, que también redimensiona
  // por querystring. Sin esto se pedían a w=1600 (≈290 KiB) para pintarlas a 300.
  if (url.includes("images.unsplash.com")) {
    const [base] = url.split("?");
    return `${base}?w=${width}&h=${Math.round(width * 0.75)}&fit=crop&auto=format&q=${quality}`;
  }

  if (!url.includes(PUBLIC_SEG)) return url;
  // OJO: con `width` a secas Supabase NO recalcula el alto — fuerza el ancho y
  // deja el alto original, devolviendo la imagen aplastada (medido: una foto de
  // 928x1152 salía como 200x1152). Hay que dar ancho Y alto con `resize=contain`,
  // que trata el par como caja máxima y conserva la proporción (-> 161x200).
  return `${url.replace(PUBLIC_SEG, RENDER_SEG)}?width=${width}&height=${width}&resize=contain&quality=${quality}`;
}

/**
 * `srcset` con el ancho pedido y su doble, para pantallas de alta densidad.
 * Devuelve undefined si la URL no es transformable (no tiene sentido un srcset
 * que apunte dos veces al mismo archivo externo).
 */
export function imgSrcSet(url: string | null | undefined, width: number, quality = 78): string | undefined {
  if (!url) return undefined;
  const transformable = url.includes(PUBLIC_SEG) || url.includes("images.unsplash.com");
  if (!transformable) return undefined;
  return `${imgUrl(url, width, quality)} ${width}w, ${imgUrl(url, width * 2, quality)} ${width * 2}w`;
}
