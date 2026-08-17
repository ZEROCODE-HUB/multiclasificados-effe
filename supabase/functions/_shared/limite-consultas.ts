// Cuántas veces puede alguien preguntarle a Factiliza quién es el dueño de un
// documento, y cuándo esa pregunta ya está contestada.
//
// Cada consulta cuesta dinero y devuelve datos personales de un tercero
// (RENIEC responde nombre y domicilio de cualquier DNI). Sin tope, cualquiera
// con una cuenta podía ir probando documentos: un buscador de domicilios
// pagado por nosotros.
//
// La decisión se toma aquí, sobre una lista de consultas previas, para poder
// probarla sin base de datos ni red.

/** Consulta ya hecha, tal como se guarda en `public.doc_lookups`. */
export interface ConsultaPrevia {
  doc_type: string;
  doc_number: string;
  ok: boolean;
  nombre?: string | null;
  data?: Record<string, unknown> | null;
  created_at: string;
}

export const LIMITE_POR_HORA = 5;
export const LIMITE_POR_DIA = 10;

/**
 * Cuánto vale una consulta ya hecha.
 *
 * Un DNI no cambia de dueño, y una razón social casi nunca cambia; un mes es
 * tiempo de sobra para que volver a comprar no cueste otra consulta, y poco
 * como para que el dato se quede rancio.
 */
export const VIDA_CACHE_DIAS = 30;

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

export interface Veredicto {
  permitido: boolean;
  /** Qué decirle a quien se topa con el tope. */
  motivo?: string;
  /** Cuántas le quedan en cada ventana (0 si ya no le quedan). */
  restantesHora: number;
  restantesDia: number;
}

/**
 * Decide si cabe una consulta más.
 *
 * Cuentan TODAS las consultas anteriores, encontradas o no: quien va probando
 * documentos inexistentes es precisamente a quien hay que frenar.
 */
export function evaluarLimite(historial: ConsultaPrevia[], ahora: number): Veredicto {
  const desde = (ms: number) =>
    historial.filter((c) => {
      const t = Date.parse(c.created_at);
      return Number.isFinite(t) && ahora - t < ms;
    }).length;

  const enLaHora = desde(HORA);
  const enElDia = desde(DIA);
  const restantesHora = Math.max(0, LIMITE_POR_HORA - enLaHora);
  const restantesDia = Math.max(0, LIMITE_POR_DIA - enElDia);

  if (enElDia >= LIMITE_POR_DIA) {
    return {
      permitido: false,
      motivo:
        "Has hecho muchas verificaciones hoy. Vuelve a intentarlo mañana " +
        "o escríbenos si necesitas ayuda con tu compra.",
      restantesHora,
      restantesDia,
    };
  }
  if (enLaHora >= LIMITE_POR_HORA) {
    return {
      permitido: false,
      motivo:
        "Has hecho varias verificaciones seguidas. Espera unos minutos " +
        "e inténtalo de nuevo.",
      restantesHora,
      restantesDia,
    };
  }
  return { permitido: true, restantesHora, restantesDia };
}

/**
 * Busca una respuesta ya pagada para ese mismo documento.
 *
 * Solo mira las consultas del propio usuario: no se le enseña a nadie el
 * resultado de lo que consultó otro, aunque saliera más barato.
 */
export function buscarEnCache(
  historial: ConsultaPrevia[],
  tipo: string,
  numero: string,
  ahora: number,
): ConsultaPrevia | null {
  const vigentes = historial.filter(
    (c) =>
      c.ok &&
      c.doc_type === tipo &&
      c.doc_number === numero &&
      c.nombre &&
      ahora - Date.parse(c.created_at) < VIDA_CACHE_DIAS * DIA,
  );
  if (!vigentes.length) return null;
  // La más reciente: si el dato cambió, es la que se acerca más a la verdad.
  return vigentes.reduce((a, b) =>
    Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a,
  );
}
