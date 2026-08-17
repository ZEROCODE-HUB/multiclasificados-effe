// PDF del comprobante de compra de saldo, para adjuntarlo al correo.
//
// Escrito a mano, sin librerías, igual que el generador de reportes del panel
// (src/lib/pdf.ts): un PDF 1.4 con fuentes base-14 no necesita dependencias, y
// en Deno cualquier librería sería una descarga más en cada arranque en frío.
// La mecánica del formato vive en `pdf-basico.ts`, compartida con la Hoja de
// Reclamación; aquí solo se dibuja un comprobante.
//
// Mientras la emisión electrónica no esté activa, este PDF es el comprobante
// interno. Cuando lo esté, el correo lleva el PDF oficial que devuelve Factiliza
// y este queda como respaldo.

import { A4_W, Lienzo, serializarPaginas, toBase64 } from "./pdf-basico.ts";

// Se reexporta porque `emit-invoice` lo importa desde aquí desde antes de que
// existiera `pdf-basico.ts`.
export { toBase64 };

export interface DatosComprobante {
  numero: string;
  tipo: "boleta" | "factura";
  fecha: Date;
  clienteNombre: string;
  clienteDocTipo: string | null;
  clienteDocNumero: string | null;
  detalle: string;
  subtotal: number;
  igv: number;
  total: number;
  moneda: string;
  emisorNombre: string;
  emisorRuc: string | null;
  /** Cuando el comprobante está declarado ante SUNAT, su resumen. */
  sunat?: { aceptado: boolean; hash?: string | null } | null;
  /**
   * El documento se emitió contra el entorno de PRUEBAS de Factiliza. No tiene
   * valor fiscal aunque SUNAT lo haya aceptado, y el RUC del emisor puede no ser
   * el nuestro. Tiene que verse a simple vista: quien reciba esto no debe poder
   * confundirlo con un comprobante de verdad.
   */
  pruebas?: boolean;
}

const MARGIN = 48;

const money = (n: number, moneda: string) =>
  `${moneda === "USD" ? "US$" : "S/"} ${Number(n ?? 0).toFixed(2)}`;

const fechaLarga = (d: Date) => {
  // Siempre en hora de Perú: el servidor puede estar en cualquier zona.
  const f = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return f.format(d);
};

const TITULO = {
  boleta: "BOLETA DE VENTA ELECTRÓNICA",
  factura: "FACTURA ELECTRÓNICA",
} as const;

const DOC_LABEL: Record<string, string> = { dni: "DNI", ruc: "RUC", ce: "C.E." };

export function renderComprobantePDF(d: DatosComprobante): Uint8Array {
  const c = new Lienzo();
  const derecha = A4_W - MARGIN;
  let y = MARGIN + 10;

  // Un documento de prueba se anuncia ANTES que nada. Si solo lo dijera el pie,
  // alguien podría imprimir la primera parte y creerse que tiene una factura.
  if (d.pruebas) {
    c.texto(MARGIN, y, "· · ·  DOCUMENTO DE PRUEBA — SIN VALOR FISCAL  · · ·", 12, true, 0);
    y += 26;
  }

  // Emisor
  c.texto(MARGIN, y, d.emisorNombre, 16, true);
  y += 16;
  if (d.emisorRuc) {
    c.texto(MARGIN, y, `RUC ${d.emisorRuc}`, 10, false, 0.35);
    y += 14;
  }

  // Recuadro del tipo y número, arriba a la derecha
  c.caja(derecha - 210, MARGIN, 210, 52);
  c.texto(derecha - 200, MARGIN + 20, TITULO[d.tipo], 10, true);
  c.texto(derecha - 200, MARGIN + 40, d.numero, 14, true);

  y = Math.max(y, MARGIN + 66) + 16;
  c.linea(MARGIN, y, derecha);
  y += 22;

  // Cliente
  c.texto(MARGIN, y, "Cliente", 9, true, 0.4);
  y += 15;
  c.texto(MARGIN, y, d.clienteNombre || "—", 11);
  y += 15;
  if (d.clienteDocNumero) {
    const etiqueta = DOC_LABEL[d.clienteDocTipo ?? ""] ?? "Documento";
    c.texto(MARGIN, y, `${etiqueta} ${d.clienteDocNumero}`, 10, false, 0.35);
    y += 15;
  }
  c.texto(MARGIN, y, `Fecha de emisión: ${fechaLarga(d.fecha)}`, 10, false, 0.35);
  y += 26;

  // Detalle
  c.caja(MARGIN, y - 12, derecha - MARGIN, 22, 0.92);
  c.texto(MARGIN + 8, y + 3, "Descripción", 9, true, 0.3);
  c.derecha(derecha - 8, y + 3, "Importe", 9, true);
  y += 30;
  c.texto(MARGIN + 8, y, d.detalle || "Compra de saldo", 10);
  c.derecha(derecha - 8, y, money(d.subtotal, d.moneda), 10);
  y += 18;
  c.linea(MARGIN, y, derecha);
  y += 22;

  // Totales
  const xEtiqueta = derecha - 200;
  for (const [etiqueta, valor, negrita] of [
    ["Op. gravada", money(d.subtotal, d.moneda), false],
    ["IGV (18%)", money(d.igv, d.moneda), false],
    ["Total", money(d.total, d.moneda), true],
  ] as const) {
    c.texto(xEtiqueta, y, etiqueta, negrita ? 11 : 10, negrita, negrita ? 0 : 0.35);
    c.derecha(derecha, y, valor, negrita ? 12 : 10, negrita);
    y += negrita ? 20 : 16;
  }

  // Pie: qué es este documento exactamente. Sin medias tintas.
  y += 26;
  c.linea(MARGIN, y, derecha);
  y += 18;
  if (d.pruebas) {
    // Va primero y en negrita: es lo único que importa de este documento.
    c.texto(MARGIN, y, "DOCUMENTO DE PRUEBA — SIN VALOR FISCAL", 11, true, 0);
    y += 14;
    c.texto(MARGIN, y, "Emitido contra el entorno de pruebas. No es un comprobante válido", 9, false, 0.35);
    y += 12;
    c.texto(MARGIN, y, "ante SUNAT y no sirve para sustentar gasto ni crédito fiscal.", 9, false, 0.35);
  } else if (d.sunat?.aceptado) {
    c.texto(MARGIN, y, "Comprobante electrónico declarado ante SUNAT.", 9, false, 0.35);
    if (d.sunat.hash) {
      y += 13;
      c.texto(MARGIN, y, `Código de autorización: ${d.sunat.hash}`, 8, false, 0.5);
    }
  } else {
    c.texto(MARGIN, y, "Comprobante interno de compra. No constituye documento tributario.", 9, false, 0.35);
  }
  y += 16;
  c.texto(MARGIN, y, "Gracias por tu compra.", 9, false, 0.5);

  return serializarPaginas(c.paginas());
}
