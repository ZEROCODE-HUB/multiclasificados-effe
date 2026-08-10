// Departamento de un aviso: el único criterio por el que se filtra la ubicación.
//
// Sustituye al catálogo de 1.874 distritos con ordenación por cercanía. La razón
// del cambio es de producto: un filtro por departamento es exacto y predecible
// —eliges Lima y ves Lima, punto— sin que nadie tenga que entender radios ni
// distancias, y sin que un aviso pueda quedar escondido por estar unos
// kilómetros más lejos.
//
// Las coordenadas del aviso se conservan: alimentan el mapa de la ficha y el del
// buscador. Lo que ya no hacen es decidir qué se ve.
import { DEPARTAMENTOS, TODO_EL_PERU, type Departamento } from "@/data/departamentos";

export type { Departamento };
export { DEPARTAMENTOS, TODO_EL_PERU };

export function departamentoPorId(id: string | null | undefined): Departamento | null {
  if (!id) return null;
  return DEPARTAMENTOS.find((d) => d.id === id) ?? null;
}

// Sin tildes ni mayúsculas: "ancash" y "Áncash" son lo mismo.
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reconoce el departamento dentro del texto de ubicación de un aviso.
 *
 * Sirve para los avisos ya publicados, cuya ubicación se escribió a mano
 * ("Miraflores, Lima", "lima", "Cusco - Perú"). Se busca por palabras completas
 * para no confundir: "Limatambo" no es Lima.
 */
export function departamentoDeTexto(texto: string | null | undefined): Departamento | null {
  const t = normalizar(texto ?? "");
  if (!t) return null;
  const palabras = t.split(/[^a-z0-9]+/).filter(Boolean);

  for (const dep of DEPARTAMENTOS) {
    // "Lima y Callao" se reconoce por cualquiera de los dos nombres.
    const alias = dep.id === "15" ? ["lima", "callao"] : [normalizar(dep.nombre)];
    for (const a of alias) {
      const partes = a.split(" ");
      // Nombre de una palabra: tiene que aparecer como palabra suelta.
      if (partes.length === 1 && palabras.includes(partes[0])) return dep;
      // De varias ("la libertad", "san martin", "madre de dios"): busca la secuencia.
      if (partes.length > 1 && t.includes(a)) return dep;
    }
  }
  return null;
}

/** Nombre a mostrar, con respaldo para los avisos sin departamento asignado. */
export function nombreDepartamento(id: string | null | undefined): string {
  if (id === TODO_EL_PERU.id) return TODO_EL_PERU.nombre;
  return departamentoPorId(id)?.nombre ?? "Sin especificar";
}

// El departamento elegido se recuerda en el dispositivo: preguntarlo en cada
// visita sería peor que no tenerlo.
const CLAVE = "effe:departamento";

export function departamentoGuardado(): Departamento | null {
  try {
    return departamentoPorId(localStorage.getItem(CLAVE));
  } catch {
    return null; // modo privado o almacenamiento bloqueado
  }
}

export function guardarDepartamento(dep: Departamento | null): void {
  try {
    if (dep) localStorage.setItem(CLAVE, dep.id);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento, vale solo para esta visita.
  }
}
