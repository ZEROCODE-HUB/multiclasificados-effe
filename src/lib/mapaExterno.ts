// Abrir la ubicación de un aviso en la aplicación de mapas del teléfono.
//
// POR QUÉ NO BASTA CON EL MAPA DE LA FICHA. El de la ficha sirve para situarse
// —"esto está por Miraflores"— y a propósito no da más: no tiene indicaciones,
// no calcula la ruta y no sigue al usuario mientras va. Quien decide ir a ver
// un departamento o recoger algo quiere justo eso, y hoy tenía que copiar el
// nombre del sitio a mano en otra aplicación.
import { Capacitor } from "@capacitor/core";
import { abrirEnlaceExterno } from "@/lib/share";

/**
 * El enlace universal de Google Maps.
 *
 * `?api=1&query=lat,lng` es la forma DOCUMENTADA y estable: Google promete no
 * romperla, y tanto Android como iOS la reconocen y ofrecen abrir la app en vez
 * del navegador. Las otras que circulan (`/maps?q=`, `/maps/place/`) funcionan
 * pero son URLs internas suyas, sin ninguna garantía.
 *
 * Las coordenadas van con seis decimales: son unos 11 cm, de sobra para un
 * portal, y evita que un `toString()` suelte "-12.046374000000001" en el enlace.
 */
export function enlaceDeMapaExterno(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Fuera del rango, la coordenada no es un sitio: Google abriría el mapa del
  // mundo entero y el usuario creería que el aviso está en medio del Atlántico.
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const punto = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(punto)}`;
}

/**
 * Y el de indicaciones, que es lo que de verdad se pide al pulsar "Cómo llegar".
 *
 * Sin origen: lo pone la app de mapas con la ubicación actual del teléfono, que
 * es lo correcto —nosotros no la tenemos y tampoco hace falta pedirla.
 */
export function enlaceDeRutaExterna(lat: number, lng: number): string | null {
  if (!enlaceDeMapaExterno(lat, lng)) return null;
  const punto = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(punto)}`;
}

/**
 * Abre el mapa fuera de la aplicación.
 *
 * En el APK y en el iPhone se sale al navegador del sistema y NO al navegador
 * embebido de Capacitor: dentro del embebido, Google Maps se ve como una página
 * web recortada, sin la app y sin la ubicación del usuario, que es precisamente
 * lo que se venía a buscar. `abrirEnlaceExterno` ya distingue los dos casos y es
 * el mismo camino que usa compartir un aviso.
 */
export async function abrirMapaExterno(lat: number, lng: number, comoRuta = false): Promise<boolean> {
  const url = comoRuta ? enlaceDeRutaExterna(lat, lng) : enlaceDeMapaExterno(lat, lng);
  if (!url) return false;
  await abrirEnlaceExterno(url);
  return true;
}

/** Solo para el texto del botón: en el móvil se dice "Cómo llegar". */
export const esMovil = (): boolean =>
  Capacitor.isNativePlatform() ||
  (typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches);
