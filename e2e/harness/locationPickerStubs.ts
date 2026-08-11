/**
 * Stubs del servicio de direcciones del selector de ubicación.
 *
 * Se corta la salida a Places: la prueba tiene que ser determinista. Lo que NO
 * se corta es el mapa —ese es de Google de verdad, porque justamente lo que se
 * comprueba es que se pinte y responda.
 *
 * Los datos son respuestas REALES: el punto de Miraflores y lo que devuelve
 * Google al escribir "mirafl", que son dos Miraflores distintos —uno en Lima y
 * otro en Arequipa, a 1000 km— con el mismo nombre.
 */

export async function ubicacionDeCoordenadas() {
  return { region: "Provincia de Lima", referencia: "Miraflores, Lima" };
}

export function nuevaSesionDeBusqueda() {
  return "sesion-de-prueba";
}

const LUGARES = {
  "mirafl-lima": {
    lat: -12.1224, lng: -77.0313,
    region: "Provincia de Lima", referencia: "Miraflores, Lima",
  },
  "mirafl-arequipa": {
    lat: -16.3815, lng: -71.5088,
    region: "Arequipa", referencia: "Miraflores, Arequipa",
  },
} as const;

export async function sugerirDirecciones(consulta: string) {
  if (!consulta || consulta.trim().length < 3) return [];
  return [
    { id: "mirafl-lima", titulo: "Miraflores", detalle: "Lima, Provincia de Lima" },
    { id: "mirafl-arequipa", titulo: "Miraflores", detalle: "Arequipa" },
  ];
}

export async function detalleDeLugar(id: string) {
  return LUGARES[id as keyof typeof LUGARES] ?? null;
}
