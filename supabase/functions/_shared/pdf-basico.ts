// Cimientos para escribir un PDF a mano, sin librerías.
//
// Salieron de `comprobante-pdf.ts`, que los tenía dentro: cuando hizo falta un
// segundo documento (la Hoja de Reclamación) copiarlos habría significado dos
// codificadores WinAnsi que se van separando con el tiempo. Aquí está solo la
// mecánica del formato —codificación, operadores de dibujo, tabla de
// referencias cruzadas—; lo que se dibuja vive en cada documento.
//
// Un PDF 1.4 con las fuentes base-14 (Helvetica) no necesita incrustar nada, y
// en Deno cada dependencia es una descarga más en cada arranque en frío.

export const A4_W = 595;
export const A4_H = 842;

// Solo los caracteres que WinAnsi no cubre en su tramo bajo; el resto pasa tal cual.
const WINANSI: Record<string, string> = {
  "€": "\x80", "…": "\x85", "‘": "\x91", "’": "\x92", "“": "\x93", "”": "\x94",
  "–": "\x96", "—": "\x97", "•": "\x95",
};

/** Pasa a WinAnsi y escapa lo que rompería un literal `(...)` de PDF. */
export function pdfText(s: string): string {
  let out = "";
  for (const ch of String(s ?? "")) {
    const cp = ch.codePointAt(0)!;
    const b = cp <= 0xff ? ch : WINANSI[ch] ?? "?";
    out += b === "\\" || b === "(" || b === ")" ? "\\" + b : b;
  }
  return out;
}

/**
 * Ancho aproximado de un texto en Helvetica.
 *
 * Sin las métricas reales de la fuente esto es una estimación: 0,5 em por
 * carácter (0,55 en negrita) es la media de Helvetica. Sirve para alinear a la
 * derecha y para decidir dónde cortar una línea, no para justificar.
 */
export function anchoAprox(s: string, size: number, bold = false): number {
  return s.length * size * (bold ? 0.55 : 0.5);
}

/**
 * Parte un texto en líneas que caben en `ancho` puntos.
 *
 * Respeta los saltos de línea que escribió la persona —en un reclamo los
 * párrafos son parte de lo que relata— y corta por palabras. Una palabra más
 * larga que la línea (una URL, un número de operación pegado) se trocea, que es
 * preferible a que se salga del papel.
 */
export function envolver(texto: string, ancho: number, size: number, bold = false): string[] {
  const cabe = (s: string) => anchoAprox(s, size, bold) <= ancho;
  const salida: string[] = [];

  for (const parrafo of String(texto ?? "").split(/\r?\n/)) {
    if (parrafo.trim() === "") {
      salida.push("");
      continue;
    }
    let linea = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      let p = palabra;
      // Palabra sola más larga que la línea: se trocea.
      while (!cabe(p)) {
        const max = Math.max(1, Math.floor(ancho / (size * (bold ? 0.55 : 0.5))));
        if (linea) { salida.push(linea); linea = ""; }
        salida.push(p.slice(0, max));
        p = p.slice(max);
      }
      const tentativa = linea ? `${linea} ${p}` : p;
      if (cabe(tentativa)) {
        linea = tentativa;
      } else {
        if (linea) salida.push(linea);
        linea = p;
      }
    }
    salida.push(linea);
  }

  return salida;
}

/**
 * Operadores de dibujo sobre una o varias páginas.
 *
 * Las coordenadas van desde ARRIBA (y crece hacia abajo), que es como se piensa
 * un documento; la conversión al sistema del PDF (origen abajo-izquierda) se
 * hace aquí y no en quien dibuja.
 */
export class Lienzo {
  private paginasCerradas: string[] = [];
  private ops: string[] = [];

  texto(x: number, y: number, s: string, size = 10, bold = false, gris = 0) {
    this.ops.push(
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${gris} g ${x} ${A4_H - y} Td (${pdfText(s)}) Tj ET`,
    );
  }

  derecha(xFin: number, y: number, s: string, size = 10, bold = false) {
    this.texto(xFin - anchoAprox(s, size, bold), y, s, size, bold);
  }

  centrado(centro: number, y: number, s: string, size = 10, bold = false, gris = 0) {
    this.texto(centro - anchoAprox(s, size, bold) / 2, y, s, size, bold, gris);
  }

  linea(x1: number, y: number, x2: number, gris = 0.75) {
    this.ops.push(`${gris} G 0.7 w ${x1} ${A4_H - y} m ${x2} ${A4_H - y} l S`);
  }

  caja(x: number, y: number, w: number, h: number, gris = 0.94) {
    this.ops.push(`${gris} g ${x} ${A4_H - y - h} ${w} ${h} re f`);
  }

  /** Marco sin relleno, para encuadrar un bloque. */
  marco(x: number, y: number, w: number, h: number, gris = 0.8) {
    this.ops.push(`${gris} G 0.7 w ${x} ${A4_H - y - h} ${w} ${h} re S`);
  }

  nuevaPagina() {
    this.paginasCerradas.push(this.ops.join("\n"));
    this.ops = [];
  }

  /** Contenido de cada página, en orden. */
  paginas(): string[] {
    return [...this.paginasCerradas, this.ops.join("\n")];
  }
}

/**
 * Arma el archivo: objetos, tabla de referencias cruzadas y trailer.
 *
 * Los desplazamientos del xref son posiciones de BYTE. Se puede usar
 * `body.length` como tal porque `pdfText` ya dejó todo en el rango 0-255, de
 * modo que un carácter es un byte.
 */
export function serializarPaginas(contenidos: string[]): Uint8Array {
  const n = Math.max(1, contenidos.length);
  const paginas = contenidos.length ? contenidos : [""];

  // 1 catálogo, 2 páginas, luego por cada página su objeto y su stream, y al
  // final las dos fuentes.
  const primerPagina = 3;
  const kids = paginas.map((_, i) => `${primerPagina + i * 2} 0 R`).join(" ");
  const fuenteRegular = primerPagina + n * 2;
  const fuenteNegrita = fuenteRegular + 1;

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`,
  ];
  paginas.forEach((contenido, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] ` +
        `/Resources << /Font << /F1 ${fuenteRegular} 0 R /F2 ${fuenteNegrita} 0 R >> >> ` +
        `/Contents ${primerPagina + i * 2 + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

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
