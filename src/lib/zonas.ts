// Búsqueda dentro del catálogo de zonas (src/data/zonas.ts: los 1.874 distritos
// del Perú).
//
// La zona es lo que hace posible el "cerca de mí": al publicar deja el aviso con
// coordenadas siempre —aunque el anunciante no toque el mapa— y al buscar
// permite ordenar por cercanía a quien no da permiso de ubicación.
//
// Todo se calcula de forma perezosa: el catálogo no se interpreta ni se indexa
// hasta que alguien lo pide, para no gravar el arranque de la app.
import { zonas as cargarZonas, type Zona } from "@/data/zonas";

export type { Zona };
export { cargarZonas as zonas };

/** Cómo se nombra una zona en toda la app: "Miraflores, Lima". */
export function etiquetaZona(z: Zona): string {
  const partes = [...new Set([z.nombre, z.provincia, z.departamento].filter(Boolean))];
  return partes.slice(0, z.niveles).join(", ");
}

// Sin tildes, sin mayúsculas y sin dobles espacios: quien escribe "ancash" o
// "Áncash" busca lo mismo.
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface Entrada {
  zona: Zona;
  /** Etiqueta normalizada: por lo que se compara al reconocer un texto. */
  clave: string;
  /** Clave + el departamento, para que "arequipa" saque todos sus distritos. */
  buscable: string;
}

let indice: Entrada[] | null = null;

function obtenerIndice(): Entrada[] {
  if (indice) return indice;
  indice = cargarZonas().map((zona) => ({
    zona,
    clave: normalizar(etiquetaZona(zona)),
    buscable: normalizar(`${zona.nombre} ${zona.provincia} ${zona.departamento}`),
  }));
  return indice;
}

/**
 * Zonas que coinciden con lo tecleado. Primero las que EMPIEZAN por el texto
 * ("Lima" antes que "Alto Amazonas"), luego el resto. Busca también por
 * provincia y departamento, así que "arequipa" saca todos sus distritos.
 */
export function buscarZonas(consulta: string, limite = 50): Zona[] {
  const q = normalizar(consulta);
  const entradas = obtenerIndice();
  if (!q) return entradas.slice(0, limite).map((e) => e.zona);

  const empiezan: Zona[] = [];
  const contienen: Zona[] = [];
  for (const e of entradas) {
    if (e.clave.startsWith(q)) empiezan.push(e.zona);
    else if (e.buscable.includes(q)) contienen.push(e.zona);
    if (empiezan.length >= limite) break;
  }
  return [...empiezan, ...contienen].slice(0, limite);
}

export function zonaPorId(id: string | null | undefined): Zona | null {
  if (!id) return null;
  return obtenerIndice().find((e) => e.zona.id === id)?.zona ?? null;
}

/**
 * Reconoce la zona a partir del texto de ubicación guardado en el aviso. Sirve
 * para preseleccionarla al editar y para los avisos antiguos, que se escribían
 * a mano ("Lima, Miraflores" con las partes al revés, o solo "Miraflores").
 */
export function zonaPorTexto(texto: string | null | undefined): Zona | null {
  const q = normalizar(texto ?? "");
  if (!q) return null;
  const entradas = obtenerIndice();

  const exacta = entradas.find((e) => e.clave === q);
  if (exacta) return exacta.zona;

  // "Lima, Miraflores" → las mismas palabras en otro orden.
  const partes = q.split(/[,/·|-]+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length > 1) {
    const alReves = entradas.find((e) => {
      const suyas = e.clave.split(",").map((p) => p.trim());
      return suyas.length === partes.length && suyas.every((p) => partes.includes(p));
    });
    if (alReves) return alReves.zona;
  }

  // Solo el nombre, sin región ("Miraflores"). Se exige que no haya empate: hay
  // varios "Bellavista" en el país y adivinar el equivocado sería peor que nada.
  const porNombre = entradas.filter((e) => normalizar(e.zona.nombre) === partes[0]);
  if (porNombre.length === 1) return porNombre[0].zona;

  return null;
}

/** Zona cuyo centro cae más cerca de un punto. Para nombrar lo que da el GPS. */
export function zonaMasCercana(lat: number, lng: number): Zona {
  const entradas = obtenerIndice();
  let mejor = entradas[0].zona;
  let menor = Infinity;
  for (const { zona } of entradas) {
    const d = distanciaKm(lat, lng, zona.lat, zona.lng);
    if (d < menor) {
      menor = d;
      mejor = zona;
    }
  }
  return mejor;
}

// La zona del usuario se recuerda en el dispositivo: elegirla una vez y que se
// la vuelvan a preguntar en cada búsqueda sería peor que no tenerla.
const CLAVE_ZONA = "effe:zona";

export function zonaGuardada(): Zona | null {
  try {
    return zonaPorId(localStorage.getItem(CLAVE_ZONA));
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

export function guardarZona(zona: Zona | null): void {
  try {
    if (zona) localStorage.setItem(CLAVE_ZONA, zona.id);
    else localStorage.removeItem(CLAVE_ZONA);
  } catch {
    // Sin almacenamiento, la zona vale solo para esta visita.
  }
}

/** Distancia en kilómetros entre dos puntos (misma fórmula que el buscador). */
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const a =
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad) +
    Math.sin(lat1 * rad) * Math.sin(lat2 * rad);
  return R * Math.acos(Math.min(1, Math.max(-1, a)));
}
