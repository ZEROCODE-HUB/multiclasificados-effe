// Direcciones: sugerir mientras se escribe, y saber qué hay en un punto.
//
// Todo con Google, que es lo que corresponde ahora que el mapa también es suyo
// (ver src/lib/googleMaps.ts: sus condiciones no permiten usar sus datos sobre
// un mapa ajeno). Antes había un respaldo con Nominatim, el geocodificador de
// OpenStreetMap; se ha retirado, porque sin llave de Google ya no hay mapa
// ninguno y ese respaldo no salvaba nada.
//
// Se usan DOS servicios, cada uno para lo suyo:
//
//   · Places API (New) — sugerir mientras se escribe. Es el servicio hecho para
//     esto: entiende texto a medias y devuelve predicciones, no direcciones.
//   · Geocoding API — saber qué hay en un punto del mapa (geocodificación
//     inversa), que es lo que rellena el departamento cuando el anunciante toca
//     el mapa en vez de escribir.
//
// Places funciona por SESIONES: todas las pulsaciones de teclado de una misma
// búsqueda comparten un identificador y se facturan como una sola sesión cuando
// se cierra pidiendo el detalle del lugar elegido. Sin ese identificador cada
// tecla se cobraría por separado, que es la forma cara de hacer lo mismo.

const GOOGLE_KEY = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY?.trim() || "";

/** True si hay llave de Google configurada (para poder decirlo en la interfaz). */
export const hayGoogleMaps = (): boolean => GOOGLE_KEY.length > 0;

// Comparar nombres de sitio sin que la ortografía moleste: sin tildes, sin
// mayúsculas y con la zeta como ese, porque Google escribe "Cuzco" el
// departamento y "Cusco" la ciudad, y "Cusco, Cuzco" queda ridículo.
const clave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/z/g, "s").trim();

/** Punto alrededor del cual buscar, para que "Av. Larco" salga en la ciudad correcta. */
export interface SesgoZona {
  lat: number;
  lng: number;
  /** Radio en metros. Un distrito entra de sobra en 15 km. */
  radioM?: number;
}

/** Una fila de la lista de sugerencias. */
export interface Sugerencia {
  /** Identificador del lugar en Google. Es lo que se pide luego para el punto. */
  id: string;
  /** Lo que se lee en grande: "Av. José Larco 1234". */
  titulo: string;
  /** Lo que va debajo y desambigua: "Miraflores, Lima". */
  detalle?: string;
}

/** Lo que se sabe de un lugar una vez elegido. */
export interface LugarElegido {
  lat: number;
  lng: number;
  region: string | null;
  referencia: string | null;
}

// ─── Sesiones de búsqueda ─────────────────────────────────────────────────────

/**
 * Abre una sesión de búsqueda. Se llama al empezar a escribir y el mismo
 * identificador acompaña a todas las sugerencias hasta que se elige una.
 */
export function nuevaSesionDeBusqueda(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Contextos sin `crypto` (algún WebView antiguo). El identificador solo
    // tiene que ser distinto por sesión, no criptográficamente fuerte.
    return `s-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

// ─── Leer los componentes de una dirección ────────────────────────────────────

/** Un componente de dirección, en cualquiera de los dos formatos de Google. */
interface Componente {
  long_name?: string;  // Geocoding API
  longText?: string;   // Places API (New)
  types?: string[];
}

/** Lo que se sabe de un sitio sin preguntarle nada al anunciante. */
export interface UbicacionDelPunto {
  /**
   * Nombre de la región tal cual lo da Google ("Provincia de Lima",
   * "Gobierno Regional de Lima", "Cuzco", "La Libertad"). NO es el nombre del
   * departamento: hay que pasarlo por `departamentoDeTexto`, que reconoce esas
   * variantes.
   */
  region: string | null;
  /** Cómo se lee la ubicación: "Miraflores, Lima", "Chancay, Huaral", "Trujillo". */
  referencia: string | null;
}

/**
 * De los componentes de una dirección a la región y la referencia.
 *
 * Comprobado contra la API real en varios puntos del Perú, porque los nombres no
 * salen donde uno esperaría:
 *
 *   Miraflores → a1 "Provincia de Lima" · a2 "Lima"   · locality "Miraflores"
 *   Chancay    → a1 "Gobierno Regional de Lima" · a2 "Huaral" · locality "Chancay"
 *   Cusco      → a1 "Cuzco"            · a2 "Cuzco"  · locality "Cusco"
 *   Trujillo   → a1 "La Libertad"      · a2 "Trujillo" · locality "Trujillo"
 */
export function interpretarComponentes(componentes: Componente[]): UbicacionDelPunto {
  const vacio: UbicacionDelPunto = { region: null, referencia: null };

  // El primero que aparece de cada tipo: los resultados vienen del más
  // específico al más general, así que gana el más cercano al punto.
  const partes: Record<string, string> = {};
  for (const c of componentes) {
    const nombre = c.longText ?? c.long_name;
    for (const t of c.types ?? []) {
      if (nombre && !partes[t]) partes[t] = nombre;
    }
  }
  if (partes.country && partes.country !== "Perú" && partes.country !== "Peru") return vacio;

  const region = partes.administrative_area_level_1 ?? null;
  // El distrito. `locality` es lo que la gente llama su sitio; si no viene,
  // el nivel 3 (distrito) sirve igual.
  const distrito = partes.locality ?? partes.administrative_area_level_3 ?? null;
  const provincia = partes.administrative_area_level_2 ?? null;

  // La provincia solo se añade si aporta algo: "Chancay, Huaral" ubica,
  // "Trujillo, Trujillo" no.
  const referencia = distrito
    ? provincia && clave(provincia) !== clave(distrito)
      ? `${distrito}, ${provincia}`
      : distrito
    : provincia;

  return { region, referencia };
}

// ─── Places API (New) — sugerir mientras se escribe ───────────────────────────

const PLACES = "https://places.googleapis.com/v1";

interface RespuestaAutocomplete {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }>;
}

/**
 * Direcciones que coinciden con lo escrito, de la más probable a la menos.
 *
 * Devuelve [] si no hay ninguna o si el servicio falla: buscar una dirección es
 * una comodidad, nunca debe impedir publicar (siempre queda tocar el mapa).
 *
 * Si Places falla —cuota agotada, la API desactivada por accidente, un corte de
 * su lado— se cae al buscador por Geocoding, que aguanta bastante bien el texto
 * a medias. No es la forma buena de hacerlo y lo avisa por consola, pero es
 * preferible a que publicar se quede sin buscador de direcciones: el resultado
 * es peor, no inexistente.
 */
export async function sugerirDirecciones(
  consulta: string,
  opciones: { sesion?: string; sesgo?: SesgoZona } = {},
): Promise<Sugerencia[]> {
  const q = consulta.trim();
  if (!q || !hayGoogleMaps()) return [];

  try {
    const cuerpo: Record<string, unknown> = {
      input: q,
      languageCode: "es",
      regionCode: "PE",
      // Limitado al Perú: "Av. Larco" existe en medio mundo.
      includedRegionCodes: ["pe"],
    };
    if (opciones.sesion) cuerpo.sessionToken = opciones.sesion;
    if (opciones.sesgo) {
      // Preferencia, no filtro: si la dirección está fuera igual se devuelve.
      cuerpo.locationBias = {
        circle: {
          center: { latitude: opciones.sesgo.lat, longitude: opciones.sesgo.lng },
          radius: opciones.sesgo.radioM ?? 15000,
        },
      };
    }

    const res = await fetch(`${PLACES}/places:autocomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY },
      body: JSON.stringify(cuerpo),
    });
    if (!res.ok) throw new Error(`Places respondió ${res.status}`);
    const data = (await res.json()) as RespuestaAutocomplete;

    return (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => ({
        id: p.placeId!,
        titulo: p.structuredFormat?.mainText?.text || p.text?.text || q,
        detalle: p.structuredFormat?.secondaryText?.text,
      }))
      .slice(0, 5);
  } catch (e) {
    console.warn("[geocode] Places no contestó; se usa Geocoding como respaldo:", e);
    return sugerenciasPorGeocoding(q, opciones.sesgo);
  }
}

interface RespuestaDetalle {
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Componente[];
}

/**
 * El punto y la zona de un lugar elegido de la lista.
 *
 * Una sola llamada trae la coordenada Y los componentes de la dirección, así que
 * de aquí sale a la vez dónde poner el pin y en qué departamento archivar el
 * aviso. Además es la que cierra la sesión de facturación.
 */
export async function detalleDeLugar(placeId: string, sesion?: string): Promise<LugarElegido | null> {
  if (!placeId || !hayGoogleMaps()) return null;
  try {
    const url = new URL(`${PLACES}/places/${encodeURIComponent(placeId)}`);
    url.searchParams.set("languageCode", "es");
    url.searchParams.set("regionCode", "PE");
    if (sesion) url.searchParams.set("sessionToken", sesion);

    const res = await fetch(url.toString(), {
      headers: {
        "X-Goog-Api-Key": GOOGLE_KEY,
        // Solo lo que se usa: el FieldMask decide lo que se cobra.
        "X-Goog-FieldMask": "location,addressComponents",
      },
    });
    if (!res.ok) throw new Error(`Places (detalle) respondió ${res.status}`);
    const data = (await res.json()) as RespuestaDetalle;

    const lat = Number(data.location?.latitude);
    const lng = Number(data.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const { region, referencia } = interpretarComponentes(data.addressComponents ?? []);
    return { lat, lng, region, referencia };
  } catch (e) {
    console.warn("[geocode] no se pudo obtener el detalle del lugar:", e);
    return null;
  }
}

// ─── Geocoding API ────────────────────────────────────────────────────────────

const GEOCODING = "https://maps.googleapis.com/maps/api/geocode/json";

interface GeocodingRespuesta {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    place_id?: string;
    address_components?: Componente[];
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
}

/** Grados de latitud/longitud que abarcan aproximadamente un radio en metros. */
const gradosPara = (metros: number) => metros / 111_320;

/**
 * Sugerencias sacadas del geocodificador, solo como respaldo de Places.
 *
 * Devuelve direcciones completas y no predicciones, así que acierta menos con
 * texto a medias; aun así "av jose larco mira" da la avenida de Miraflores.
 */
async function sugerenciasPorGeocoding(consulta: string, sesgo?: SesgoZona): Promise<Sugerencia[]> {
  try {
    const url = new URL(GEOCODING);
    url.searchParams.set("address", consulta);
    url.searchParams.set("key", GOOGLE_KEY);
    url.searchParams.set("language", "es");
    url.searchParams.set("region", "pe");
    url.searchParams.set("components", "country:PE");
    if (sesgo) {
      const d = gradosPara(sesgo.radioM ?? 15000);
      url.searchParams.set(
        "bounds",
        `${sesgo.lat - d},${sesgo.lng - d}|${sesgo.lat + d},${sesgo.lng + d}`,
      );
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Geocoding respondió ${res.status}`);
    const data = (await res.json()) as GeocodingRespuesta;
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(`Geocoding: ${data.status}`);
    }

    const vistos = new Set<string>();
    return (data.results ?? [])
      .filter((r) => r.place_id)
      .map((r) => {
        // "Miraflores, Perú" → "Miraflores": el país sobra, todo está en Perú.
        const titulo = (r.formatted_address || consulta).replace(/,\s*Per[úu]\s*$/i, "");
        return { id: r.place_id!, titulo, detalle: contextoDe(r.address_components, titulo) };
      })
      // Dos entradas que se leen exactamente igual no le sirven a nadie.
      .filter((s) => {
        const k = clave(`${s.titulo}|${s.detalle ?? ""}`);
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .slice(0, 5);
  } catch (e) {
    console.warn("[geocode] tampoco se pudo buscar por Geocoding:", e);
    return [];
  }
}

/**
 * De qué provincia y región es un resultado, para distinguir dos sitios que se
 * llaman igual.
 *
 * Hace falta de verdad: escribir "mirafl" devuelve DOS resultados y los dos
 * ponen "Miraflores, Perú". Uno está en Lima y el otro en Arequipa.
 */
function contextoDe(comp: Componente[] = [], titulo: string): string | undefined {
  const de = (t: string) => {
    const c = comp.find((x) => x.types?.includes(t));
    return c?.longText ?? c?.long_name ?? "";
  };
  const partes: string[] = [];
  for (const v of [de("administrative_area_level_2"), de("administrative_area_level_1")]) {
    // Ni vacíos, ni repetidos, ni lo que ya se lee en el título del resultado.
    if (v && !clave(titulo).includes(clave(v)) && !partes.some((p) => clave(p) === clave(v))) {
      partes.push(v);
    }
  }
  return partes.join(", ") || undefined;
}

/**
 * Qué hay en un punto del mapa: su región y una referencia legible.
 *
 * Es la pieza que permite que publicar sea marcar un punto y nada más. El
 * anunciante no elige departamento ni escribe su distrito: se deducen de donde
 * puso el pin, que es un dato y no una redacción.
 *
 * Devuelve los dos campos a null sin llave de Google, si el servicio falla o si
 * el punto cae donde no hay nada: quien llama necesita siempre un plan B, porque
 * el departamento es obligatorio y no puede depender de un servicio ajeno.
 */
export async function ubicacionDeCoordenadas(lat: number, lng: number): Promise<UbicacionDelPunto> {
  const vacio: UbicacionDelPunto = { region: null, referencia: null };
  if (!hayGoogleMaps()) return vacio;

  const url = new URL(GEOCODING);
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", GOOGLE_KEY);
  url.searchParams.set("language", "es");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Geocoding respondió ${res.status}`);
    const data = (await res.json()) as GeocodingRespuesta;
    if (data.status && data.status !== "OK") return vacio;

    // Se juntan los componentes de TODOS los resultados, del más específico al
    // más general: el primer resultado puede ser un portal sin distrito.
    const todos = (data.results ?? []).flatMap((r) => r.address_components ?? []);
    return interpretarComponentes(todos);
  } catch (e) {
    console.warn("[geocode] no se pudo identificar la ubicación del punto:", e);
    return vacio;
  }
}
