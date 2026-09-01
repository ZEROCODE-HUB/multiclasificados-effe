// Agrupar las denuncias por aviso, para la pestaña "Reportados" del panel.
//
// Vive aparte de `admin.ts` a propósito: es una función pura, y `admin.ts`
// arrastra el cliente de Supabase. Aquí el único import es de TIPO, así que se
// borra al compilar y este módulo no carga nada — las pruebas que simulan
// `@/lib/admin` siguen usando el agrupador de verdad sin tener que declararlo.
import type { AdminReport } from "@/lib/admin";

/**
 * Las denuncias, agrupadas por aviso.
 *
 * La decisión que toma quien modera es **sobre el aviso**, no sobre cada
 * denuncia: lo que se deshabilita o se deja es el aviso. Sin agrupar, un aviso
 * con nueve denuncias eran nueve tarjetas y nueve botones para una sola
 * decisión — y al pulsar el primero las otras ocho se quedaban en "Pendiente"
 * con el aviso ya caído.
 *
 * Además el listado viene ordenado por fecha, así que las denuncias de un mismo
 * aviso se dispersan entre las demás en cuanto llegan en días distintos: la
 * etiqueta "9 reportes de este aviso" obligaba a ir a buscarlas.
 *
 * El orden es por denuncias SIN CERRAR, de más a menos. Eso es "controlar la
 * cantidad de Reportes que tiene un aviso": el más denunciado arriba, no
 * perdido por fecha.
 */
export interface GrupoDeDenuncias {
  clave: string;
  listingId: string | null;
  titulo: string;
  denuncias: AdminReport[];
  /** Las que aún no están resueltas: son las que exigen una decisión. */
  abiertas: AdminReport[];
  /** La más reciente del grupo, para desempatar el orden. */
  ultima: string;
  /**
   * Cuántas denuncias tiene el aviso EN LA BASE, que no siempre es
   * `denuncias.length`: con el filtro de estado puesto, la lista solo trae
   * parte. Sale de `reportes_del_aviso`, que calcula `admin_list_reports`.
   * Decir "1 en total" cuando en la base hay 3 sería mentir al moderador.
   */
  total: number;
}

export function agruparPorAviso(lista: AdminReport[]): GrupoDeDenuncias[] {
  const porAviso = new Map<string, GrupoDeDenuncias>();
  for (const r of lista) {
    // Sin aviso (no debería pasar en esta pestaña) cada denuncia va sola: es
    // preferible a juntar cosas que no tienen nada que ver bajo una clave nula.
    const clave = r.listing_id ?? `sin-aviso:${r.id}`;
    const grupo = porAviso.get(clave) ?? {
      clave, listingId: r.listing_id, titulo: r.listing_title ?? "Aviso",
      denuncias: [], abiertas: [], ultima: r.created_at, total: 0,
    };
    grupo.denuncias.push(r);
    if (r.status !== "resolved") grupo.abiertas.push(r);
    if (r.created_at > grupo.ultima) grupo.ultima = r.created_at;
    // Nunca menos de las que se están enseñando: si la base dijera menos (o no
    // dijera nada, como en las denuncias anteriores a la 0136), manda lo que hay.
    grupo.total = Math.max(grupo.total, r.reportes_del_aviso ?? 0, grupo.denuncias.length);
    porAviso.set(clave, grupo);
  }
  return [...porAviso.values()].sort(
    (a, b) => b.abiertas.length - a.abiertas.length || b.ultima.localeCompare(a.ultima),
  );
}
