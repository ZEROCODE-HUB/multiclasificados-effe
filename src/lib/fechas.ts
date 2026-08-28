// Fechas de la app, siempre en hora del Perú.
//
// EL FALLO QUE ORIGINÓ ESTE ARCHIVO
//
// El aviso publicado el 28 de agosto a las 16:33 salía fechado el 27. No era el
// reloj del servidor: la marca de tiempo se guarda bien, en UTC. Lo que se hacía
// era recortarla a los diez primeros caracteres —tirando la hora— y volver a
// leer el resto con `new Date("2026-08-28")`. Un texto de SOLO FECHA lo
// interpreta JavaScript como medianoche UTC, y al pintarlo en hora del Perú
// (UTC−5) retrocede cinco horas y cae en el día anterior. A todos los avisos,
// siempre.
//
// Y el recorte tenía un segundo error, más silencioso: cortar el ISO da el día
// EN UTC, no en Lima. Un aviso publicado a las 20:00 de un martes se guarda como
// la 01:00 UTC del miércoles, así que se fechaba un día por delante.
//
// De ahí que todo pase por aquí y que la zona sea explícita: no la del
// dispositivo, porque un anunciante que viaje —o el cliente mirando desde otro
// país— vería una fecha distinta para el mismo aviso.
export const ZONA_PERU = "America/Lima";

/**
 * Descarta lo que no sea una fecha utilizable.
 *
 * Y desactiva la trampa que causó el fallo original: un texto de SOLO FECHA
 * ("2026-08-28") lo lee JavaScript como medianoche UTC, así que al pintarlo en
 * el Perú retrocede al día anterior. Aquí se le pone la hora del Perú, porque
 * cuando alguien escribe un día suelto se refiere a ese día AQUÍ.
 *
 * −05:00 fijo y no una zona con reglas: el Perú no cambia la hora desde 1994.
 */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function instante(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(SOLO_FECHA.test(iso) ? `${iso}T00:00:00-05:00` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * El día en el Perú, como `YYYY-MM-DD`.
 * Sustituye al `.slice(0, 10)` sobre el ISO, que daba el día en UTC.
 * `en-CA` porque es el idioma cuyo formato corto YA es el ISO; construirlo a
 * mano con getFullYear/getMonth volvería a usar la zona del dispositivo.
 */
export function fechaDelDia(iso: string | null | undefined): string {
  const d = instante(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_PERU, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** "28 ago. 2026" */
export function fechaLarga(iso: string | null | undefined): string {
  const d = instante(iso);
  if (!d) return "";
  return d.toLocaleDateString("es-PE", {
    timeZone: ZONA_PERU, day: "2-digit", month: "short", year: "numeric",
  });
}

/**
 * "28 ago. 2026, 04:33 p. m." — la fecha CON la hora y el minuto.
 * Es lo que pidió el cliente: saber a qué hora exacta se publicó su aviso.
 */
export function fechaHoraLarga(iso: string | null | undefined): string {
  const d = instante(iso);
  if (!d) return "";
  return d.toLocaleString("es-PE", {
    timeZone: ZONA_PERU,
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** "28/08/2026, 04:33 p. m." — la versión compacta, para listas y tablas. */
export function fechaHoraCorta(iso: string | null | undefined): string {
  const d = instante(iso);
  if (!d) return "";
  return d.toLocaleString("es-PE", {
    timeZone: ZONA_PERU,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
