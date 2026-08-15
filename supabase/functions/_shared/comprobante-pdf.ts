// PDF del comprobante de compra de saldo, para adjuntarlo al correo.
//
// Escrito a mano, sin librerías, igual que el generador de reportes del panel
// (src/lib/pdf.ts): un PDF 1.4 con fuentes base-14 no necesita dependencias, y
// en Deno cualquier librería sería una descarga más en cada arranque en frío.
// Comparte con aquél la técnica (codificación WinAnsi y tabla de referencias
// cruzadas por posición de byte) pero no el contenido: aquí se dibuja un
// comprobante, no una tabla paginada.
//
// Mientras la emisión electrónica no esté activa, este PDF es el comprobante
// interno. Cuando lo esté, el correo lleva el PDF oficial que devuelve Factiliza
// y este queda como respaldo.

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

const A4_W = 595;
const A4_H = 842;
const MARGIN = 48;

// Solo los caracteres que WinAnsi no cubre en su tramo bajo; el resto pasa tal cual.
const WINANSI: Record<string, string> = {
  "€": "\x80", "…": "\x85", "‘": "\x91", "’": "\x92", "“": "\x93", "”": "\x94",
  "–": "\x96", "—": "\x97", "•": "\x95",
};

/** Pasa a WinAnsi y escapa lo que rompería un literal `(...)` de PDF. */
function pdfText(s: string): string {
  let out = "";
  for (const ch of String(s ?? "")) {
    const cp = ch.codePointAt(0)!;
    const b = cp <= 0xff ? ch : WINANSI[ch] ?? "?";
    out += b === "\\" || b === "(" || b === ")" ? "\\" + b : b;
  }
  return out;
}

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

/** Operadores de dibujo: texto, líneas y rectángulos. */
class Lienzo {
  private ops: string[] = [];

  texto(x: number, y: number, s: string, size = 10, bold = false, gris = 0) {
    this.ops.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${gris} g ${x} ${A4_H - y} Td (${pdfText(s)}) Tj ET`,
    );
  }

  derecha(xFin: number, y: number, s: string, size = 10, bold = false) {
    // Helvetica es proporcional; sin las métricas reales esto se aproxima, que
    // es suficiente para alinear importes a la derecha.
    const ancho = s.length * size * (bold ? 0.55 : 0.5);
    this.texto(xFin - ancho, y, s, size, bold);
  }

  linea(x1: number, y: number, x2: number, gris = 0.75) {
    this.ops.push(`${gris} G 0.7 w ${x1} ${A4_H - y} m ${x2} ${A4_H - y} l S`);
  }

  caja(x: number, y: number, w: number, h: number, gris = 0.94) {
    this.ops.push(`${gris} g ${x} ${A4_H - y - h} ${w} ${h} re f`);
  }

  build(): string {
    return this.ops.join("\n");
  }
}

function serialize(objects: string[]): Uint8Array {
  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}

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

  const contenido = c.build();
  return serialize([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] ` +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ]);
}

/**
 * Base64 de un binario, por trozos.
 * `String.fromCharCode(...bytes)` de golpe desborda la pila con un PDF de unos
 * cientos de KB: hay un límite de argumentos por llamada.
 */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
