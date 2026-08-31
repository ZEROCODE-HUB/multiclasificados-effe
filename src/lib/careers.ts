// «Trabaje con nosotros» (punto B-18 de la auditoría).
//
// Postulaciones espontáneas de trabajo EN eFFe. No confundir con
// `src/lib/applications.ts`, que son las postulaciones a los avisos de empleo
// que publican los anunciantes: aquellas van dirigidas a un cliente, estas a
// nosotros, y mezclarlas significaría enseñarle a un anunciante currículums que
// no le pertenecen. Por eso la tabla se llama `careers` y no `job_applications`.
import { supabase } from "@/lib/supabase";

export type GradoInstruccion =
  | "secundaria" | "tecnico" | "bachiller" | "maestria" | "doctorado";

export type CareerDocType = "DNI" | "CE" | "Pasaporte";

export type CareerStatus = "nueva" | "revisada" | "descartada" | "contratada";

/** Los cinco grados que pidió el cliente, en el orden en que los enumeró. */
export const GRADOS: { valor: GradoInstruccion; etiqueta: string }[] = [
  { valor: "secundaria", etiqueta: "Secundaria" },
  { valor: "tecnico", etiqueta: "Técnico" },
  { valor: "bachiller", etiqueta: "Bachiller" },
  { valor: "maestria", etiqueta: "Maestría" },
  { valor: "doctorado", etiqueta: "Doctorado" },
];

export const NOMBRE_GRADO: Record<GradoInstruccion, string> =
  Object.fromEntries(GRADOS.map((g) => [g.valor, g.etiqueta])) as Record<GradoInstruccion, string>;

export const ESTADOS: { valor: CareerStatus; etiqueta: string }[] = [
  { valor: "nueva", etiqueta: "Nueva" },
  { valor: "revisada", etiqueta: "Revisada" },
  { valor: "contratada", etiqueta: "Contratada" },
  { valor: "descartada", etiqueta: "Descartada" },
];

export const NOMBRE_ESTADO: Record<CareerStatus, string> =
  Object.fromEntries(ESTADOS.map((e) => [e.valor, e.etiqueta])) as Record<CareerStatus, string>;

export interface CareerInput {
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  docType: CareerDocType;
  docNumber: string;
  email: string;
  phone?: string;
  grado: GradoInstruccion;
  puesto: string;
  descripcion: string;
}

export interface Career extends CareerInput {
  id: string;
  code: number | null;
  status: CareerStatus;
  nota: string | null;
  createdAt: string;
  /** Nombre completo ya montado, que es como se lee en la tabla del panel. */
  nombreCompleto: string;
}

/**
 * El formulario a medio rellenar.
 *
 * `grado` puede estar vacío mientras no se elija, y el tipo lo dice en lugar de
 * mentir con un cast. No es un detalle de tipos: el desplegable de Radix
 * necesita un valor —la cadena vacía— desde el primer render, porque si empieza
 * en `undefined` pasa de no controlado a controlado a mitad de vida.
 */
export type BorradorCareer =
  Partial<Omit<CareerInput, "grado">> & { grado?: GradoInstruccion | "" };

/**
 * Qué falta por rellenar, en el orden en que aparece en pantalla.
 *
 * Devuelve el nombre del PRIMER campo incompleto además de la lista, porque es
 * ahí donde hay que dejar el cursor: es el criterio que ya se aplicó al
 * publicar un aviso (punto 9 de los temas pendientes) y el que espera el
 * cliente en cualquier formulario de la plataforma.
 */
export function camposIncompletos(input: BorradorCareer): (keyof CareerInput)[] {
  const faltan: (keyof CareerInput)[] = [];
  const vacio = (v?: string) => !v || !v.trim();

  if (vacio(input.apellidoPaterno)) faltan.push("apellidoPaterno");
  if (vacio(input.apellidoMaterno)) faltan.push("apellidoMaterno");
  if (vacio(input.nombres)) faltan.push("nombres");
  if (vacio(input.docNumber)) faltan.push("docNumber");
  // Un correo mal escrito es peor que uno vacío: la postulación entra y la
  // respuesta no llega nunca. Se comprueba la forma, no la existencia.
  if (vacio(input.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email!.trim())) {
    faltan.push("email");
  }
  if (!input.grado) faltan.push("grado");
  if (vacio(input.puesto)) faltan.push("puesto");
  if (vacio(input.descripcion)) faltan.push("descripcion");

  return faltan;
}

function mapCareer(r: Record<string, unknown>): Career {
  const nombres = String(r.nombres ?? "");
  const paterno = String(r.apellido_paterno ?? "");
  const materno = String(r.apellido_materno ?? "");
  return {
    id: String(r.id),
    code: r.code == null ? null : Number(r.code),
    apellidoPaterno: paterno,
    apellidoMaterno: materno,
    nombres,
    docType: (r.doc_type as CareerDocType) ?? "DNI",
    docNumber: String(r.doc_number ?? ""),
    email: String(r.email ?? ""),
    phone: r.phone ? String(r.phone) : "",
    grado: (r.grado as GradoInstruccion) ?? "secundaria",
    puesto: String(r.puesto ?? ""),
    descripcion: String(r.descripcion ?? ""),
    status: (r.status as CareerStatus) ?? "nueva",
    nota: r.nota ? String(r.nota) : null,
    createdAt: String(r.created_at ?? ""),
    nombreCompleto: [nombres, paterno, materno].filter(Boolean).join(" "),
  };
}

export class YaPostulaste extends Error {}

/**
 * Registra una postulación.
 *
 * No pide sesión: exigir cuenta para dejar un currículum pierde a la mitad de
 * los candidatos en la puerta. El aviso a Admin y Superadmin lo dispara un
 * trigger de la base (migración 0135), no esta función: así sale también si
 * mañana la postulación entra por otra vía.
 */
export async function submitCareer(input: CareerInput): Promise<{ code: number | null; createdAt: string }> {
  const { data, error } = await supabase
    .from("careers")
    .insert({
      apellido_paterno: input.apellidoPaterno.trim(),
      apellido_materno: input.apellidoMaterno.trim(),
      nombres: input.nombres.trim(),
      doc_type: input.docType,
      doc_number: input.docNumber.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      grado: input.grado,
      puesto: input.puesto.trim(),
      descripcion: input.descripcion.trim(),
    })
    .select("code, created_at")
    .single();

  if (error) {
    // El freno de la 0135 llega como violación de CHECK con un mensaje ya
    // redactado para quien postula. Se distingue para que la pantalla no lo
    // muestre como "error inesperado", que es lo que parece un 23514 crudo.
    if (error.code === "23514" || /postulación/i.test(error.message)) {
      throw new YaPostulaste(error.message);
    }
    throw new Error(error.message);
  }

  const fila = (data ?? {}) as Record<string, unknown>;
  return {
    code: fila.code == null ? null : Number(fila.code),
    createdAt: String(fila.created_at ?? ""),
  };
}

export interface FiltroCareers {
  estado?: CareerStatus | "all";
  buscar?: string;
  desde?: string;
  hasta?: string;
}

export async function fetchCareers(filtro: FiltroCareers = {}): Promise<Career[]> {
  let consulta = supabase.from("careers").select("*").order("created_at", { ascending: false });

  if (filtro.estado && filtro.estado !== "all") consulta = consulta.eq("status", filtro.estado);
  if (filtro.desde) consulta = consulta.gte("created_at", filtro.desde);
  // `hasta` incluye el día entero: sin esto, filtrar "hasta hoy" dejaría fuera
  // justo lo de hoy, que es lo que se busca al abrir la pantalla.
  if (filtro.hasta) consulta = consulta.lt("created_at", `${filtro.hasta}T23:59:59.999Z`);
  if (filtro.buscar?.trim()) {
    const q = filtro.buscar.trim();
    consulta = consulta.or(
      `nombres.ilike.%${q}%,apellido_paterno.ilike.%${q}%,apellido_materno.ilike.%${q}%,doc_number.ilike.%${q}%,email.ilike.%${q}%,puesto.ilike.%${q}%`,
    );
  }

  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapCareer(r as Record<string, unknown>));
}

/** Cambia el estado de una postulación y deja constancia de quién la revisó. */
export async function actualizarPostulacion(
  id: string,
  cambios: { status?: CareerStatus; nota?: string },
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("careers")
    .update({
      ...(cambios.status ? { status: cambios.status } : {}),
      ...(cambios.nota !== undefined ? { nota: cambios.nota.trim() || null } : {}),
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Las filas tal como se descargan a Excel desde el panel. */
export function filasParaExcel(lista: Career[]): Record<string, string | number>[] {
  return lista.map((c) => ({
    "N.º": c.code ?? "",
    Fecha: c.createdAt,
    Apellidos: [c.apellidoPaterno, c.apellidoMaterno].filter(Boolean).join(" "),
    Nombres: c.nombres,
    Documento: `${c.docType} ${c.docNumber}`,
    Correo: c.email,
    Teléfono: c.phone ?? "",
    "Grado de instrucción": NOMBRE_GRADO[c.grado] ?? c.grado,
    Puesto: c.puesto,
    Descripción: c.descripcion,
    Estado: NOMBRE_ESTADO[c.status] ?? c.status,
    Nota: c.nota ?? "",
  }));
}
