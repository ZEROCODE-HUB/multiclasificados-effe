// Buscar una dirección y obtener su punto en el mapa.
//
// Con llave de Google (VITE_GOOGLE_MAPS_API_KEY) usa su Places API, que en Perú
// acierta mucho más con calles y numeraciones. Sin llave cae a Nominatim, el
// geocodificador de OpenStreetMap: gratis y sin registro, pero con cobertura
// pobre fuera de las vías principales y un límite de una consulta por segundo
// que no da para una app en producción.
//
// Se usa la Places API NUEVA (places.googleapis.com) y no la de geocodificación
// clásica: esta última no admite llamadas desde el navegador —no envía cabeceras
// CORS— y está pensada para servidores. La nueva sí.

// El `?.` no es adorno: fuera de Vite (el harness de las pruebas de layout
// compila con esbuild a secas) `import.meta.env` no existe, y sin la guarda el
// módulo reventaría al cargarse. Se accede directo y no por una variable
// intermedia, porque Vite sustituye este patrón al compilar.
const GOOGLE_KEY = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY?.trim() || "";

/** True si hay llave de Google configurada (para poder decirlo en la interfaz). */
export const hayGoogleMaps = (): boolean => GOOGLE_KEY.length > 0;

export interface GeoResult {
  lat: number;
  lng: number;
  /** Lo que se enseña en la lista de resultados: "Av. José Larco 1234". */
  label: string;
  /** Dirección completa, para distinguir dos resultados de igual nombre. */
  detalle?: string;
}

/** Punto alrededor del cual buscar, para que "Av. Larco" salga en la ciudad correcta. */
export interface SesgoZona {
  lat: number;
  lng: number;
  /** Radio en metros. Un distrito entra de sobra en 15 km. */
  radioM?: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org";

// ─── Google Places (New) ──────────────────────────────────────────────────────

interface PlaceApiRespuesta {
  places?: Array<{
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  }>;
}

async function buscarEnGoogle(consulta: string, sesgo?: SesgoZona): Promise<GeoResult[]> {
  // El FieldMask es obligatorio y además define cuánto cuesta la consulta: se
  // piden SOLO los tres campos que se usan.
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: consulta,
      languageCode: "es",
      regionCode: "PE",
      maxResultCount: 5,
      ...(sesgo
        ? {
            locationBias: {
              circle: {
                center: { latitude: sesgo.lat, longitude: sesgo.lng },
                radius: sesgo.radioM ?? 15000,
              },
            },
          }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Places respondió ${res.status}`);
  const data = (await res.json()) as PlaceApiRespuesta;
  return (data.places ?? [])
    .map((p) => ({
      lat: Number(p.location?.latitude),
      lng: Number(p.location?.longitude),
      label: p.displayName?.text || p.formattedAddress || consulta,
      detalle: p.formattedAddress,
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

// ─── Nominatim (respaldo sin llave) ───────────────────────────────────────────

async function buscarEnNominatim(consulta: string): Promise<GeoResult[]> {
  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("q", consulta);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "pe");
  url.searchParams.set("accept-language", "es");
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((r: { lat?: string; lon?: string; display_name?: string; name?: string }) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      label: r.name || r.display_name || consulta,
      detalle: r.display_name,
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/**
 * Direcciones que coinciden con lo escrito, de la más probable a la menos.
 * Devuelve [] si no hay ninguna o si el servicio falla: buscar una dirección es
 * una comodidad, nunca debe impedir publicar (siempre queda tocar el mapa).
 */
export async function buscarDirecciones(consulta: string, sesgo?: SesgoZona): Promise<GeoResult[]> {
  const q = consulta.trim();
  if (!q) return [];
  try {
    return hayGoogleMaps() ? await buscarEnGoogle(q, sesgo) : await buscarEnNominatim(q);
  } catch (e) {
    console.warn("[geocode] no se pudo buscar la dirección:", e);
    return [];
  }
}

/** Primer resultado, para cuando no hace falta que el usuario elija. */
export async function geocode(consulta: string, sesgo?: SesgoZona): Promise<GeoResult | null> {
  const [primero] = await buscarDirecciones(consulta, sesgo);
  return primero ?? null;
}
