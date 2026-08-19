// País del aviso y del que mira. Calco estructural de `departamentos.ts`.
//
// El país por defecto se deduce de la ZONA HORARIA del dispositivo, que el
// navegador ya conoce: ni pide permiso, ni llama a ningún servicio, ni tarda, y
// funciona igual en web y dentro del APK. La geolocalización sería más exacta,
// pero pide un permiso que la mayoría no da (y en el WebView de iOS ya nos dio
// problemas de callbacks que nunca responden). Si la zona no se reconoce, Perú.
import { PAISES, PAIS_POR_DEFECTO, OTRO_PAIS, type Pais } from "@/data/paises";

export type { Pais };
export { PAISES, PAIS_POR_DEFECTO, OTRO_PAIS };

export function paisPorCodigo(code: string | null | undefined): Pais | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  return PAISES.find((p) => p.code === c) ?? null;
}

export function nombrePais(code: string | null | undefined): string {
  return paisPorCodigo(code)?.nombre ?? "Otro país";
}

/** El Perú es el caso normal, y el único con departamentos del INEI. */
export function esPeru(code: string | null | undefined): boolean {
  return (code ?? PAIS_POR_DEFECTO).trim().toUpperCase() === "PE";
}

function zonaDelDispositivo(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return ""; // WebViews viejos pueden no traer la zona
  }
}

/**
 * Deduce el país por la zona horaria. Perú de respaldo: es donde está el 99 %
 * de los avisos, así que equivocarse hacia Perú es el error barato.
 */
export function paisDeZonaHoraria(tz: string = zonaDelDispositivo()): Pais {
  const zona = (tz ?? "").trim();
  if (zona) {
    const encontrado = PAISES.find((p) => p.zonas.includes(zona));
    if (encontrado) return encontrado;
  }
  return paisPorCodigo(PAIS_POR_DEFECTO)!;
}

// El país elegido se recuerda en el dispositivo: preguntarlo en cada visita
// sería peor que no tenerlo (misma decisión que con el departamento).
const CLAVE = "effe:pais";

export function paisGuardado(): Pais | null {
  try {
    return paisPorCodigo(localStorage.getItem(CLAVE));
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

export function guardarPais(p: Pais | string | null): void {
  try {
    const code = typeof p === "string" ? p : p?.code;
    if (code) localStorage.setItem(CLAVE, code);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento, vale solo para esta visita.
  }
}

/** Lo que el usuario eligió; si no eligió nada, lo que dice su zona horaria. */
export function paisPreferido(): Pais {
  return paisGuardado() ?? paisDeZonaHoraria();
}

/**
 * Pregunta al servidor de qué país viene la visita (lo sabe por la IP).
 *
 * Es más fiable que la zona horaria, que es lo único que se puede mirar sin
 * salir del navegador: un equipo con la hora mal configurada hacía que el
 * buscador filtrase por Venezuela. No pide permisos ni interrumpe a nadie.
 *
 * Devuelve null si no se puede saber (sin red, en local, detrás de una VPN que
 * Vercel no resuelve). Quien llama se queda entonces con lo que ya tenía.
 */
export async function paisPorIP(): Promise<Pais | null> {
  try {
    const base = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
    const res = await fetch(`${base}/api/pais`, { cache: "no-store" });
    if (!res.ok) return null;
    const { pais } = (await res.json()) as { pais?: string | null };
    // Un país que no está en el catálogo (que no es la lista del mundo entero)
    // no sirve para filtrar: mejor dejarlo como estaba.
    return paisPorCodigo(pais ?? null);
  } catch {
    return null;
  }
}

/**
 * Ubicación tal como se le enseña a quien mira el aviso.
 *
 * Dentro del Perú no se escribe el país (sobra), pero fuera es justo el dato
 * que decide si algo te sirve: "Miraflores" y "Miraflores, Chile" no son lo
 * mismo.
 */
export function ubicacionConPais(location: string | null | undefined, country: string | null | undefined): string {
  const texto = (location ?? "").trim();
  if (esPeru(country)) return texto;
  const pais = nombrePais(country);
  if (!texto) return pais;
  return texto.toLowerCase().includes(pais.toLowerCase()) ? texto : `${texto}, ${pais}`;
}
