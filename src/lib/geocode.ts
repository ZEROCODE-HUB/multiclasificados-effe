// Buscar una dirección y obtener su punto en el mapa.
//
// Con llave de Google (VITE_GOOGLE_MAPS_API_KEY) usa su Places API, que en Perú
// acierta mucho más con calles y numeraciones. Sin llave cae a Nominatim, el
// geocodificador de OpenStreetMap: gratis y sin registro, pero con cobertura
// pobre fuera de las vías principales y un límite de una consulta por segundo
// que no da para una app en producción.
//
// Se usa la Geocoding API (maps.googleapis.com/maps/api/geocode). Comprobado
// contra la llave real del proyecto:
//   · Geocoding      → responde con `Access-Control-Allow-Origin: *`, o sea que
//                      el navegador la deja llamar. Es la que se usa.
//   · Places (New)   → habría que habilitarla aparte en la consola de Google.
//   · Places legacy  → NO manda cabeceras CORS: el navegador la bloquea.
// Además Geocoding es la más barata de las tres y devuelve la coordenada del
// portal exacto cuando la dirección lleva número.

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

// ─── Google Geocoding ─────────────────────────────────────────────────────────

interface GeocodingRespuesta {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
}

/** Grados de latitud/longitud que abarcan aproximadamente un radio en metros. */
const gradosPara = (metros: number) => metros / 111_320;

async function buscarEnGoogle(consulta: string, sesgo?: SesgoZona): Promise<GeoResult[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", consulta);
  url.searchParams.set("key", GOOGLE_KEY);
  url.searchParams.set("language", "es");
  // `region` inclina los resultados hacia Perú y `components` los limita a él:
  // sin esto, "Av. Larco" puede devolver una calle de otro país.
  url.searchParams.set("region", "pe");
  url.searchParams.set("components", "country:PE");
  if (sesgo) {
    // El recuadro es solo una preferencia, no un filtro: si la dirección está
    // fuera igual se devuelve, pero se prioriza lo de la zona elegida.
    const d = gradosPara(sesgo.radioM ?? 15000);
    url.searchParams.set(
      "bounds",
      `${sesgo.lat - d},${sesgo.lng - d}|${sesgo.lat + d},${sesgo.lng + d}`,
    );
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Geocoding respondió ${res.status}`);
  const data = (await res.json()) as GeocodingRespuesta;

  // ZERO_RESULTS es una respuesta normal (no hay esa dirección); el resto de
  // estados sí son fallos de configuración y conviene verlos en la consola.
  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Geocoding: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`);
  }

  return (data.results ?? [])
    .map((r) => ({
      lat: Number(r.geometry?.location?.lat),
      lng: Number(r.geometry?.location?.lng),
      label: r.formatted_address || consulta,
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .slice(0, 5);
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

/**
 * Región de unas coordenadas: el nombre del departamento al que pertenece el
 * punto ("Provincia de Lima", "Cuzco", "La Libertad"…).
 *
 * Se usa al publicar para deducir el departamento del punto que marca el
 * anunciante, en vez de hacérselo elegir. Devuelve null sin llave, si el
 * servicio falla o si el punto cae fuera de una región conocida — quien llama
 * debe tener siempre un camino alternativo.
 *
 * Se pide `administrative_area_level_1`, que es el nivel de departamento en
 * Perú. Ojo con los nombres: Google devuelve "Cuzco" con zeta y "Provincia de
 * Lima" en vez de "Lima", así que hay que reconocerlos con tolerancia
 * (departamentoDeTexto lo hace).
 */
export async function regionDeCoordenadas(lat: number, lng: number): Promise<string | null> {
  if (!hayGoogleMaps()) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", GOOGLE_KEY);
  url.searchParams.set("language", "es");
  url.searchParams.set("result_type", "administrative_area_level_1");
  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Geocoding respondió ${res.status}`);
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{ address_components?: Array<{ long_name?: string }> }>;
    };
    if (data.status && data.status !== "OK") return null;
    return data.results?.[0]?.address_components?.[0]?.long_name ?? null;
  } catch (e) {
    console.warn("[geocode] no se pudo identificar la región del punto:", e);
    return null;
  }
}
