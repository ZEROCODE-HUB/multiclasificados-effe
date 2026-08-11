// Construye el comprobante electrónico para Factiliza y lee su respuesta.
//
// Módulo PURO, sin red: aquí no se llama a nadie. Se separa así porque es donde
// se juega que SUNAT acepte o rechace, y eso hay que poder probarlo entero sin
// credenciales, sin conexión y sin gastar envíos.
//
// El contrato está copiado de la documentación de Factiliza
// (https://docs.factiliza.com/api-facturacion/endpoint/invoice/send). Tres cosas
// de ahí que no se adivinan y que conviene tener presentes:
//
//   1. `sub_Total` va CON IGV y `valor_Venta` SIN él. Un "subtotal" que incluye
//      el impuesto es lo contrario de lo que uno asume, y confundirlos es un
//      rechazo seguro.
//   2. Un rechazo llega con HTTP 200 y `success:false`. Mirar el código HTTP
//      hace que un documento rechazado parezca aceptado.
//   3. `legend` con código 1000 es el importe en letras, y es obligatorio.
//
// Lo que NO hace este módulo: decidir si hay que emitir, reintentar o esperar.
// Eso vive en la base de datos (migración 0083), que es la que gobierna el
// estado. Aquí solo se arma un JSON y se interpreta otro.

// ─── Catálogos de SUNAT que usamos ────────────────────────────────────────────

/** Catálogo 01 — tipo de comprobante. */
export const TIPO_DOC = { boleta: "03", factura: "01" } as const;

/** Catálogo 06 — tipo de documento de identidad del cliente. */
export const TIPO_DOC_CLIENTE = { dni: "1", ruc: "6" } as const;

/** Catálogo 51 — tipo de operación. Venta interna. */
const TIPO_OPERACION = "0101";

/** Catálogo 07 — afectación al IGV. Gravado, operación onerosa. */
const AFECTACION_GRAVADO = "10";

/** Catálogo 03 — unidad de medida. NIU = unidad (bien). */
const UNIDAD = "NIU";

const IGV_PORCENTAJE = 18;

// ─── Importe en letras ────────────────────────────────────────────────────────

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE", "VEINTE",
];
const DECENAS = ["", "", "VEINTI", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

/** Un número entero de 0 a 999 en letras. */
function centenasEnLetras(n: number): string {
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto <= 20) {
    if (resto > 0) partes.push(UNIDADES[resto]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    // "VEINTIUNO" va junto; de treinta en adelante, "TREINTA Y UNO".
    if (d === 2) partes.push(u === 0 ? "VEINTE" : `${DECENAS[2]}${UNIDADES[u]}`);
    else partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`);
  }
  return partes.join(" ").trim();
}

/** Un entero de 0 a 999 999 999 en letras. */
function enteroEnLetras(n: number): string {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLÓN" : `${centenasEnLetras(millones)} MILLONES`);
  }
  if (miles > 0) {
    // "MIL", no "UNO MIL".
    partes.push(miles === 1 ? "MIL" : `${centenasEnLetras(miles)} MIL`);
  }
  if (resto > 0) partes.push(centenasEnLetras(resto));
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

/** Nombre de la moneda como lo escribe SUNAT en la leyenda. */
const MONEDA_EN_LETRAS: Record<string, string> = { PEN: "SOLES", USD: "DÓLARES AMERICANOS" };

/**
 * El importe en letras que exige SUNAT (leyenda 1000).
 * 118.5 → "SON CIENTO DIECIOCHO CON 50/100 SOLES"
 */
export function montoEnLetras(monto: number, moneda = "PEN"): string {
  const redondeado = Math.round(Math.abs(monto) * 100) / 100;
  const entero = Math.floor(redondeado);
  const centimos = Math.round((redondeado - entero) * 100);
  const nombre = MONEDA_EN_LETRAS[moneda] ?? MONEDA_EN_LETRAS.PEN;
  return `SON ${enteroEnLetras(entero)} CON ${String(centimos).padStart(2, "0")}/100 ${nombre}`;
}

// ─── Fecha de emisión ─────────────────────────────────────────────────────────

/**
 * La fecha en hora de Perú, con el desplazamiento explícito.
 *
 * Se construye a mano y no con `toISOString()` porque el servidor corre en UTC:
 * una compra de las 20:00 de Lima es de las 01:00 del día SIGUIENTE en UTC, y
 * emitir con la fecha del día siguiente es un comprobante fuera de fecha.
 */
export function fechaEmisionPeru(fecha: Date): string {
  const enLima = new Date(fecha.getTime() - 5 * 60 * 60 * 1000);
  const p = (n: number, d = 2) => String(n).padStart(d, "0");
  return `${enLima.getUTCFullYear()}-${p(enLima.getUTCMonth() + 1)}-${p(enLima.getUTCDate())}` +
    `T${p(enLima.getUTCHours())}:${p(enLima.getUTCMinutes())}:${p(enLima.getUTCSeconds())}-05:00`;
}

// ─── Construcción del comprobante ─────────────────────────────────────────────

export interface DatosDelComprobante {
  tipo: "boleta" | "factura";
  serie: string;
  correlativo: number | string;
  fechaEmision: Date;
  moneda?: string;
  emisorRuc: string;
  clienteDocTipo: "dni" | "ruc" | null;
  clienteDocNumero: string | null;
  clienteNombre: string;
  clienteDireccion?: string | null;
  descripcion: string;
  /** Total CON IGV: es lo que pagó el cliente. */
  total: number;
  /** Base imponible, sin IGV. */
  subtotal: number;
  igv: number;
  /** Identificador del comprobante en nuestro sistema (campo opcional de su API). */
  idBaseDato?: string | null;
}

export class ComprobanteInvalido extends Error {}

const c2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Arma el cuerpo que espera POST /api/v1/invoice/send.
 *
 * Lanza `ComprobanteInvalido` antes de gastar un envío si los datos no pueden
 * dar un documento válido. Rechazar en local es gratis; que lo rechace SUNAT
 * cuesta un correlativo y una incidencia que resolver a mano.
 */
export function construirComprobante(d: DatosDelComprobante): Record<string, unknown> {
  const moneda = d.moneda ?? "PEN";

  // --- Coherencia entre el tipo de comprobante y el documento del cliente ---
  if (d.tipo === "factura" && d.clienteDocTipo !== "ruc") {
    throw new ComprobanteInvalido("Una factura exige RUC del cliente.");
  }
  if (d.tipo === "boleta" && d.clienteDocTipo === "ruc") {
    throw new ComprobanteInvalido("Con RUC corresponde factura, no boleta.");
  }
  if (!d.clienteDocNumero) {
    throw new ComprobanteInvalido("Falta el documento del cliente.");
  }
  const largoEsperado = d.clienteDocTipo === "ruc" ? 11 : 8;
  if (!new RegExp(`^\\d{${largoEsperado}}$`).test(d.clienteDocNumero)) {
    throw new ComprobanteInvalido(
      `El documento del cliente debería tener ${largoEsperado} dígitos.`,
    );
  }
  if (!/^\d{11}$/.test(d.emisorRuc ?? "")) {
    throw new ComprobanteInvalido("Falta el RUC del emisor o no tiene 11 dígitos.");
  }
  if (!(d.total > 0)) throw new ComprobanteInvalido("El importe tiene que ser mayor que cero.");

  // --- Cuadre al céntimo ---
  // Es la causa más común de rechazo. Los precios de la plataforma ya incluyen
  // IGV, así que la base sale de dividir; si por redondeo no cuadra, se ajusta
  // el IGV, que es el que absorbe el céntimo suelto.
  const total = c2(d.total);
  let gravadas = c2(d.subtotal);
  let igv = c2(d.igv);
  if (c2(gravadas + igv) !== total) {
    gravadas = c2(total / (1 + IGV_PORCENTAJE / 100));
    igv = c2(total - gravadas);
  }
  if (c2(gravadas + igv) !== total) {
    throw new ComprobanteInvalido(
      `Los importes no cuadran: ${gravadas} + ${igv} != ${total}`,
    );
  }

  const fecha = fechaEmisionPeru(d.fechaEmision);

  return {
    tipo_Operacion: TIPO_OPERACION,
    tipo_Doc: TIPO_DOC[d.tipo],
    serie: d.serie,
    correlativo: String(d.correlativo),
    tipo_Moneda: moneda,
    fecha_Emision: fecha,
    empresa_Ruc: d.emisorRuc,

    cliente_Tipo_Doc: d.clienteDocTipo === "ruc" ? TIPO_DOC_CLIENTE.ruc : TIPO_DOC_CLIENTE.dni,
    cliente_Num_Doc: d.clienteDocNumero,
    cliente_Razon_Social: d.clienteNombre,
    // SUNAT admite la venta sin dirección del cliente en boletas; se manda vacío
    // antes que inventarse una.
    cliente_Direccion: d.clienteDireccion ?? "",

    monto_Oper_Gravadas: gravadas,
    monto_Oper_Exoneradas: 0,
    monto_Igv: igv,
    total_Impuestos: igv,
    // OJO: `valor_Venta` va SIN IGV y `sub_Total` CON él. No es un descuido.
    valor_Venta: gravadas,
    sub_Total: total,
    monto_Imp_Venta: total,

    estado_Documento: "0",
    manual: false,
    ...(d.idBaseDato ? { id_Base_Dato: String(d.idBaseDato) } : {}),

    detalle: [
      {
        unidad: UNIDAD,
        cantidad: 1,
        cod_Producto: "SALDO",
        descripcion: d.descripcion,
        monto_Valor_Unitario: gravadas,
        monto_Base_Igv: gravadas,
        porcentaje_Igv: IGV_PORCENTAJE,
        igv,
        tip_Afe_Igv: AFECTACION_GRAVADO,
        total_Impuestos: igv,
        monto_Precio_Unitario: total,
        monto_Valor_Venta: gravadas,
        factor_Icbper: 0,
      },
    ],

    forma_pago: [{ tipo: "Contado", monto: total, cuota: 0, fecha_Pago: fecha }],

    legend: [{ legend_Code: "1000", legend_Value: montoEnLetras(total, moneda) }],
  };
}

// ─── Lectura de la respuesta ──────────────────────────────────────────────────

export type Desenlace = "aceptado" | "observado" | "rechazado" | "error";

export interface Resultado {
  desenlace: Desenlace;
  hash: string | null;
  cdr: Record<string, unknown> | null;
  cdrZip: string | null;
  codigo: string | null;
  mensaje: string;
  /** Si conviene reintentarlo tal cual. Un rechazo NO se reintenta solo. */
  reintentable: boolean;
}

/**
 * Interpreta lo que devuelve Factiliza.
 *
 * La trampa: **un rechazo llega con HTTP 200**. Hay que leer `success` del
 * cuerpo. Si se mirase el código HTTP, un documento rechazado por SUNAT se daría
 * por bueno, se le mandaría al cliente como válido y nadie se enteraría hasta
 * que llegara la multa.
 *
 * Cuatro desenlaces, y cada uno lleva a un sitio distinto:
 *   · aceptado   — SUNAT lo aceptó. Fin.
 *   · observado  — aceptado con notas. Vale, pero conviene mirarlo.
 *   · rechazado  — los datos están mal. NO se reintenta solo: reenviarlo daría
 *                  el mismo resultado y quemaría correlativos.
 *   · error      — no se pudo saber (red, 500, respuesta ilegible). Se reintenta.
 */
export function leerRespuesta(httpStatus: number, cuerpo: unknown): Resultado {
  const base = { hash: null, cdr: null, cdrZip: null, codigo: null } as const;

  if (cuerpo === null || typeof cuerpo !== "object") {
    return {
      ...base, desenlace: "error", reintentable: true,
      mensaje: `Respuesta ilegible de Factiliza (HTTP ${httpStatus})`,
    };
  }
  const b = cuerpo as Record<string, unknown>;
  const mensaje = String(b.message ?? "").trim();

  // 401/403 son de configuración: reintentar no arregla un token inválido, pero
  // tampoco es culpa del documento. Se marca reintentable para que se recupere
  // solo cuando alguien corrija el secret.
  if (httpStatus === 401 || httpStatus === 403) {
    return { ...base, desenlace: "error", reintentable: true,
             mensaje: mensaje || `Factiliza rechazó las credenciales (HTTP ${httpStatus})` };
  }

  if (b.success !== true) {
    // Aquí es donde importa no mirar el HTTP: esto llega con 200.
    const esDeDatos = httpStatus === 200 || httpStatus === 400 || httpStatus === 422;
    return {
      ...base,
      desenlace: esDeDatos ? "rechazado" : "error",
      reintentable: !esDeDatos,
      codigo: b.status != null ? String(b.status) : null,
      mensaje: mensaje || "Factiliza rechazó el documento sin dar motivo",
    };
  }

  const data = (b.data ?? {}) as Record<string, unknown>;
  const sunat = (data.sunatResponse ?? {}) as Record<string, unknown>;
  const cdr = (sunat.cdrResponse ?? null) as Record<string, unknown> | null;
  const notas = Array.isArray(cdr?.notes) ? (cdr!.notes as unknown[]) : [];

  // El CDR es la respuesta de SUNAT. Con notas, el documento vale pero hay algo
  // que mirar; sin CDR, Factiliza lo aceptó pero SUNAT aún no ha dicho nada.
  return {
    desenlace: notas.length > 0 ? "observado" : "aceptado",
    hash: (data.hash as string) ?? null,
    cdr,
    cdrZip: (sunat.cdrZip as string) ?? null,
    codigo: cdr?.code != null ? String(cdr.code) : null,
    mensaje: String(cdr?.description ?? mensaje ?? "Aceptado"),
    reintentable: false,
  };
}
