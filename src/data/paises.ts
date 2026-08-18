// Países en los que puede estar un aviso, y de los que puede ser quien mira.
//
// El catálogo NO es la lista de los 195 países del mundo: es donde hay peruanos
// que compran, venden o publican. Una lista completa obligaría a bajar cuatro
// mil líneas para que el 99 % elija Perú, y el "Otro país" del final cubre lo
// que falte sin dejar a nadie fuera.
//
// El `code` es ISO-3166-1 alpha-2, que es lo que entienden tanto Google Maps
// (`components=country:PE`) como el catálogo 06 de SUNAT para el comprobante de
// un extranjero.
//
// `zonas` son identificadores IANA de zona horaria. Sirven para adivinar de
// dónde mira alguien sin pedirle permiso de ubicación ni llamar a ningún
// servicio: el navegador ya sabe su zona horaria.

export interface Pais {
  /** ISO-3166-1 alpha-2. */
  code: string;
  nombre: string;
  /** Zonas horarias IANA que corresponden a este país. */
  zonas: string[];
  /** Centro aproximado, para recentrar el mapa al cambiar de país. */
  centro?: { lat: number; lng: number };
}

export const PAIS_POR_DEFECTO = "PE";

/** Se usa cuando el aviso no es de ninguno de los del catálogo. */
export const OTRO_PAIS: Pais = { code: "XX", nombre: "Otro país", zonas: [] };

// Perú primero (es el país de la plataforma); el resto, alfabético.
export const PAISES: Pais[] = [
  { code: "PE", nombre: "Perú", zonas: ["America/Lima"], centro: { lat: -12.0464, lng: -77.0428 } },
  { code: "AR", nombre: "Argentina", zonas: ["America/Argentina/Buenos_Aires", "America/Buenos_Aires", "America/Argentina/Cordoba", "America/Argentina/Mendoza"], centro: { lat: -34.6037, lng: -58.3816 } },
  { code: "BO", nombre: "Bolivia", zonas: ["America/La_Paz"], centro: { lat: -16.4897, lng: -68.1193 } },
  { code: "BR", nombre: "Brasil", zonas: ["America/Sao_Paulo", "America/Bahia", "America/Fortaleza", "America/Manaus", "America/Recife"], centro: { lat: -23.5505, lng: -46.6333 } },
  { code: "CA", nombre: "Canadá", zonas: ["America/Toronto", "America/Vancouver", "America/Montreal", "America/Edmonton", "America/Winnipeg"], centro: { lat: 43.6532, lng: -79.3832 } },
  { code: "CL", nombre: "Chile", zonas: ["America/Santiago", "Pacific/Easter"], centro: { lat: -33.4489, lng: -70.6693 } },
  { code: "CO", nombre: "Colombia", zonas: ["America/Bogota"], centro: { lat: 4.711, lng: -74.0721 } },
  { code: "CR", nombre: "Costa Rica", zonas: ["America/Costa_Rica"], centro: { lat: 9.9281, lng: -84.0907 } },
  { code: "CU", nombre: "Cuba", zonas: ["America/Havana"], centro: { lat: 23.1136, lng: -82.3666 } },
  { code: "EC", nombre: "Ecuador", zonas: ["America/Guayaquil", "Pacific/Galapagos"], centro: { lat: -0.1807, lng: -78.4678 } },
  { code: "SV", nombre: "El Salvador", zonas: ["America/El_Salvador"], centro: { lat: 13.6929, lng: -89.2182 } },
  { code: "ES", nombre: "España", zonas: ["Europe/Madrid", "Atlantic/Canary"], centro: { lat: 40.4168, lng: -3.7038 } },
  { code: "US", nombre: "Estados Unidos", zonas: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Detroit", "America/Miami"], centro: { lat: 25.7617, lng: -80.1918 } },
  { code: "GT", nombre: "Guatemala", zonas: ["America/Guatemala"], centro: { lat: 14.6349, lng: -90.5069 } },
  { code: "HN", nombre: "Honduras", zonas: ["America/Tegucigalpa"], centro: { lat: 14.0723, lng: -87.1921 } },
  { code: "IT", nombre: "Italia", zonas: ["Europe/Rome"], centro: { lat: 41.9028, lng: 12.4964 } },
  { code: "JP", nombre: "Japón", zonas: ["Asia/Tokyo"], centro: { lat: 35.6762, lng: 139.6503 } },
  { code: "MX", nombre: "México", zonas: ["America/Mexico_City", "America/Monterrey", "America/Tijuana", "America/Cancun", "America/Merida"], centro: { lat: 19.4326, lng: -99.1332 } },
  { code: "NI", nombre: "Nicaragua", zonas: ["America/Managua"], centro: { lat: 12.1149, lng: -86.2362 } },
  { code: "PA", nombre: "Panamá", zonas: ["America/Panama"], centro: { lat: 8.9824, lng: -79.5199 } },
  { code: "PY", nombre: "Paraguay", zonas: ["America/Asuncion"], centro: { lat: -25.2637, lng: -57.5759 } },
  { code: "PR", nombre: "Puerto Rico", zonas: ["America/Puerto_Rico"], centro: { lat: 18.4655, lng: -66.1057 } },
  { code: "DO", nombre: "República Dominicana", zonas: ["America/Santo_Domingo"], centro: { lat: 18.4861, lng: -69.9312 } },
  { code: "UY", nombre: "Uruguay", zonas: ["America/Montevideo"], centro: { lat: -34.9011, lng: -56.1645 } },
  { code: "VE", nombre: "Venezuela", zonas: ["America/Caracas"], centro: { lat: 10.4806, lng: -66.9036 } },
  OTRO_PAIS,
];
