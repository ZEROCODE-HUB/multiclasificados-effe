// Contacto de soporte para el usuario final.
//
// Ojo con el buzón: `soporte@coleffe.com` NO existe en cPanel (lo advierte el
// comentario de `send-reclamo/index.ts`). El único que sí recibe correo es el
// del Libro de Reclamaciones, así que es el que se enseña aquí: un botón que
// escribe a una dirección que rebota es peor que no tener botón.
export const CORREO_SOPORTE = "avisos@coleffe.com";

export interface DatosDevolucion {
  nombre?: string | null;
  correo?: string | null;
  /** Saldo actual del usuario, en soles. */
  saldo?: number | null;
}

export const ASUNTO_DEVOLUCION = "Solicitud de devolución de saldo";

/**
 * `mailto:` para pedir la devolución del saldo.
 *
 * El cuerpo va prellenado con lo que nosotros ya sabemos (quién escribe y cuánto
 * tiene) y deja escrito lo que hace falta que ponga la persona: el motivo y la
 * cuenta donde recibir el dinero. Sin eso, cada solicitud son tres correos de
 * ida y vuelta antes de poder hacer nada.
 */
/**
 * El texto del correo, aparte del enlace.
 *
 * Separado porque hace falta DOS veces: dentro del `mailto:` y, para quien no
 * tenga un cliente de correo, copiado al portapapeles. Generándolo en dos
 * sitios, el que se copia y el que se abre acabarían diciendo cosas distintas.
 */
export function cuerpoDevolucionSaldo(d: DatosDevolucion = {}): string {
  const saldo = typeof d.saldo === "number" && Number.isFinite(d.saldo) ? d.saldo : 0;
  return [
    "Hola, quiero solicitar la devolución de mi saldo.",
    "",
    `Nombre: ${d.nombre?.trim() || "(completar)"}`,
    `Correo de la cuenta: ${d.correo?.trim() || "(completar)"}`,
    `Saldo disponible: S/ ${saldo.toFixed(2)}`,
    "",
    "Monto a devolver: ",
    "Motivo: ",
    "Banco y número de cuenta (CCI): ",
    "",
    "Gracias.",
  ].join("\n");
}

export function enlaceDevolucionSaldo(d: DatosDevolucion = {}): string {
  return `mailto:${CORREO_SOPORTE}?subject=${encodeURIComponent(ASUNTO_DEVOLUCION)}`
    + `&body=${encodeURIComponent(cuerpoDevolucionSaldo(d))}`;
}
