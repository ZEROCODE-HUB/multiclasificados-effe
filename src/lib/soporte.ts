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
export const ASUNTO_SOLICITUD = "Solicitud de recarga de saldo";

/**
 * `mailto:` para PEDIR saldo, que no es lo mismo que pedir que lo devuelvan.
 *
 * Son las dos direcciones del mismo dinero y conviene no confundirlas: aquí el
 * anunciante quiere que le carguemos saldo —normalmente porque paga por
 * transferencia o con factura a nombre de su empresa, fuera de la pasarela— y el
 * equipo se lo otorga desde Gestión de Usuarios. La devolución es la contraria:
 * quiere que le saquemos el dinero que ya tiene dentro.
 *
 * El cuerpo lleva escrito lo que hace falta preguntar de todas formas (cuánto y
 * cómo va a pagar) para que la solicitud no sean tres correos de ida y vuelta.
 */
export function enlaceSolicitudDeSaldo(d: DatosDevolucion = {}): string {
  const saldo = typeof d.saldo === "number" && Number.isFinite(d.saldo) ? d.saldo : 0;
  const cuerpo = [
    "Hola, quiero solicitar una recarga de saldo para mi cuenta.",
    "",
    `Nombre: ${d.nombre?.trim() || "(completar)"}`,
    `Correo de la cuenta: ${d.correo?.trim() || "(completar)"}`,
    `Saldo actual: S/ ${saldo.toFixed(2)}`,
    "",
    "Monto que necesito recargar: ",
    "Forma de pago (transferencia, depósito, otra): ",
    "¿Necesito factura? (sí / no; si es sí, indicar RUC y razón social): ",
    "",
    "Gracias.",
  ].join("\n");
  return `mailto:${CORREO_SOPORTE}?subject=${encodeURIComponent(ASUNTO_SOLICITUD)}&body=${encodeURIComponent(cuerpo)}`;
}

/**
 * `mailto:` para pedir la devolución del saldo.
 *
 * El cuerpo va prellenado con lo que nosotros ya sabemos (quién escribe y cuánto
 * tiene) y deja escrito lo que hace falta que ponga la persona: el motivo y la
 * cuenta donde recibir el dinero. Sin eso, cada solicitud son tres correos de
 * ida y vuelta antes de poder hacer nada.
 */
export function enlaceDevolucionSaldo(d: DatosDevolucion = {}): string {
  const saldo = typeof d.saldo === "number" && Number.isFinite(d.saldo) ? d.saldo : 0;
  const cuerpo = [
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
  return `mailto:${CORREO_SOPORTE}?subject=${encodeURIComponent(ASUNTO_DEVOLUCION)}&body=${encodeURIComponent(cuerpo)}`;
}
