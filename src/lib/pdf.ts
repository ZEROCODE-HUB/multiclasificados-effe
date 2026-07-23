// Generador de PDF mínimo (PDF 1.4), sin librerías externas.
//
// Solo cubre lo que necesitan los reportes: una tabla paginada con título,
// subtítulo y pie de página. Usa Helvetica/Helvetica-Bold, que todo lector de
// PDF trae incorporadas (fuentes "base 14"), así que no hay que empotrar nada.
//
// El texto se codifica en WinAnsi (≈ Latin-1), que cubre los acentos y la ñ del
// español. Cada carácter ocupa un byte, y de eso depende el xref: los offsets
// de la tabla son posiciones en BYTES, y solo coinciden con los índices del
// string de JS mientras no se cuele un carácter multibyte.

export type Row = Record<string, string | number>;

export interface TablePDF {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Row[];
  /** Apaisado: intercambia ancho/alto para tablas anchas (más columnas caben
   *  sin truncarse con "…"). Por defecto retrato. */
  landscape?: boolean;
}

// A4 en puntos (72 dpi). Retrato = 595×842; apaisado = 842×595.
const A4_SHORT = 595;
const A4_LONG = 842;
const MARGIN = 40;
const FONT_SIZE = 9;
const ROW_H = 18;
const FOOTER_Y = 28;
const CELL_PAD = 4;

// Caracteres de WinAnsi que no coinciden con Latin-1 (rango 0x80-0x9F).
const WINANSI: Record<string, string> = {
  "€": "\x80", "‚": "\x82", "ƒ": "\x83", "„": "\x84", "…": "\x85", "†": "\x86",
  "‡": "\x87", "ˆ": "\x88", "‰": "\x89", "Š": "\x8a", "‹": "\x8b", "Œ": "\x8c",
  "Ž": "\x8e", "‘": "\x91", "’": "\x92", "“": "\x93", "”": "\x94", "•": "\x95",
  "–": "\x96", "—": "\x97", "˜": "\x98", "™": "\x99", "š": "\x9a", "›": "\x9b",
  "œ": "\x9c", "ž": "\x9e", "Ÿ": "\x9f",
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

// Helvetica es proporcional; sin las métricas AFM esto es una aproximación.
// Solo se usa para decidir dónde recortar, así que sobra con acercarse.
const widthOf = (s: string, size: number, bold: boolean) => s.length * size * (bold ? 0.55 : 0.5);

function truncate(s: string, maxW: number, size: number, bold: boolean): string {
  if (widthOf(s, size, bold) <= maxW) return s;
  let cut = s;
  while (cut.length > 1 && widthOf(cut + "...", size, bold) > maxW) cut = cut.slice(0, -1);
  return cut + "...";
}

/** Anchos de columna proporcionales al contenido más largo de cada una. */
function columnWidths(headers: string[], rows: Row[], total: number): number[] {
  const weights = headers.map((h) => {
    const cells = rows.map((r) => String(r[h] ?? "").length);
    return Math.max(h.length, ...(cells.length ? cells : [0]), 4);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / sum) * total);
}

const num = (n: number) => n.toFixed(2);

/** Un objeto PDF por entrada; `serialize` los numera desde 1 en orden. */
function serialize(objects: string[]): Uint8Array {
  // El comentario binario avisa a las herramientas de que el fichero no es texto.
  let body = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];

  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  // Cada entrada mide exactamente 20 bytes; los lectores lo asumen.
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return bytes;
}

/** Reparte las filas en páginas según el alto disponible en cada una. */
function paginate(rows: Row[], firstTop: number, restTop: number): Row[][] {
  const fits = (top: number) => Math.max(1, Math.floor((top - FOOTER_Y - ROW_H * 2) / ROW_H));
  const pages: Row[][] = [];
  let rest = rows;
  pages.push(rest.slice(0, fits(firstTop)));
  rest = rest.slice(fits(firstTop));
  while (rest.length) {
    pages.push(rest.slice(0, fits(restTop)));
    rest = rest.slice(fits(restTop));
  }
  return pages;
}

function drawTable(ops: string[], headers: string[], rows: Row[], widths: number[], top: number, pageW: number) {
  const tableW = pageW - MARGIN * 2;
  let y = top;

  // Cabecera con fondo gris muy claro.
  ops.push(`0.976 0.980 0.984 rg`, `${MARGIN} ${num(y - ROW_H)} ${tableW} ${ROW_H} re f`);
  ops.push(`BT /F2 ${FONT_SIZE} Tf 0.12 0.16 0.22 rg`);
  let x = MARGIN;
  headers.forEach((h, i) => {
    const t = truncate(h, widths[i] - CELL_PAD * 2, FONT_SIZE, true);
    ops.push(`1 0 0 1 ${num(x + CELL_PAD)} ${num(y - ROW_H + 6)} Tm (${pdfText(t)}) Tj`);
    x += widths[i];
  });
  ops.push("ET");
  y -= ROW_H;

  // Celdas.
  ops.push(`BT /F1 ${FONT_SIZE} Tf 0.20 0.25 0.33 rg`);
  for (const row of rows) {
    x = MARGIN;
    headers.forEach((h, i) => {
      const t = truncate(String(row[h] ?? ""), widths[i] - CELL_PAD * 2, FONT_SIZE, false);
      ops.push(`1 0 0 1 ${num(x + CELL_PAD)} ${num(y - ROW_H + 6)} Tm (${pdfText(t)}) Tj`);
      x += widths[i];
    });
    y -= ROW_H;
  }
  ops.push("ET");

  // Rejilla: horizontales entre filas, verticales entre columnas.
  ops.push("0.898 0.906 0.922 RG 0.5 w");
  for (let i = 0; i <= rows.length + 1; i++) {
    const ly = top - i * ROW_H;
    ops.push(`${MARGIN} ${num(ly)} m ${MARGIN + tableW} ${num(ly)} l S`);
  }
  x = MARGIN;
  for (let i = 0; i <= headers.length; i++) {
    ops.push(`${num(x)} ${num(top)} m ${num(x)} ${num(y)} l S`);
    x += widths[i] ?? 0;
  }
}

/**
 * Arma el PDF completo. Devuelve los bytes; quien llama decide qué hacer con ellos
 * (descargarlos, guardarlos en disco en los tests).
 */
export function renderTablePDF({ title, subtitle, headers, rows, landscape }: TablePDF): Uint8Array {
  const pageW = landscape ? A4_LONG : A4_SHORT;
  const pageH = landscape ? A4_SHORT : A4_LONG;
  const cols = headers.length ? headers : ["Sin datos"];
  const data = rows.length ? rows : [{ "Sin datos": "No hay información para el filtro elegido" }];
  const widths = columnWidths(cols, data, pageW - MARGIN * 2);

  const firstTop = pageH - MARGIN - (subtitle ? 46 : 32);
  const restTop = pageH - MARGIN;
  const pages = paginate(data, firstTop, restTop);

  const contents = pages.map((pageRows, p) => {
    const ops: string[] = [];
    if (p === 0) {
      ops.push(`BT /F2 15 Tf 0.07 0.09 0.15 rg 1 0 0 1 ${MARGIN} ${pageH - MARGIN - 12} Tm (${pdfText(title)}) Tj ET`);
      if (subtitle) {
        ops.push(`BT /F1 9 Tf 0.42 0.45 0.50 rg 1 0 0 1 ${MARGIN} ${pageH - MARGIN - 28} Tm (${pdfText(subtitle)}) Tj ET`);
      }
    }
    drawTable(ops, cols, pageRows, widths, p === 0 ? firstTop : restTop, pageW);
    const pie = `Página ${p + 1} de ${pages.length}`;
    ops.push(`BT /F1 8 Tf 0.61 0.64 0.69 rg 1 0 0 1 ${MARGIN} ${FOOTER_Y} Tm (${pdfText(pie)}) Tj ET`);
    return ops.join("\n");
  });

  // 1 catálogo, 2 páginas, 3 y 4 fuentes; de la 5 en adelante, página/contenido por hoja.
  const pageIds = pages.map((_, i) => 5 + i * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  contents.forEach((stream, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  return serialize(objects);
}
