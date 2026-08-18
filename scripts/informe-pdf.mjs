// Convierte un informe en Markdown a un PDF legible, sin dependencias.
//
// El proyecto ya genera PDF a mano en `src/lib/pdf.ts`, pero aquel solo sabe
// pintar tablas de reportes. Esto es lo mismo para texto corrido: títulos,
// párrafos, viñetas y tablas simples. Se mantiene aparte a propósito — es una
// herramienta de escritorio, no código que viaje a la app.
//
//   node scripts/informe-pdf.mjs docs/yape-plin.md docs/yape-plin.pdf
//
// Solo entiende el Markdown que usamos: #/##/###, listas con "-", tablas con
// "|", "---" y **negrita** (que se dibuja en negrita de verdad, línea a línea).

import { readFileSync, writeFileSync } from "node:fs";

// ─── Página ───────────────────────────────────────────────────────────────────
const ANCHO = 595;   // A4 en puntos (72 dpi)
const ALTO = 842;
const MARGEN = 56;
const UTIL = ANCHO - MARGEN * 2;
const PIE = 34;

// ─── Texto ────────────────────────────────────────────────────────────────────
// WinAnsi cubre acentos y ñ con un byte por carácter, que es de lo que depende
// la tabla de referencias cruzadas del PDF.
const WINANSI = {
  "€": "\x80", "…": "\x85", "‘": "\x91", "’": "\x92", "“": "\x93", "”": "\x94",
  "•": "\x95", "–": "\x96", "—": "\x97",
};

// Lo que WinAnsi no tiene se escribe con lo que sí: una flecha convertida en "?"
// deja frases como "create-payment ? Charge/CreatePayment", que no se entienden.
const SIN_EQUIVALENTE = { "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "×": "x" };

function pdfTexto(s) {
  let out = "";
  let texto = String(s ?? "");
  for (const [de, a] of Object.entries(SIN_EQUIVALENTE)) texto = texto.split(de).join(a);
  for (const ch of texto) {
    const cp = ch.codePointAt(0);
    const b = cp <= 0xff ? ch : WINANSI[ch] ?? "?";
    out += b === "\\" || b === "(" || b === ")" ? "\\" + b : b;
  }
  return out;
}

// Helvetica es proporcional y no tenemos sus métricas: esta aproximación solo
// sirve para decidir dónde cortar la línea, así que con acercarse basta.
const ancho = (s, size, bold) => s.length * size * (bold ? 0.55 : 0.5);

function partir(texto, size, bold, max) {
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ancho(prueba, size, bold) > max && actual) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [""];
}

// ─── Markdown → bloques ───────────────────────────────────────────────────────
function leerMarkdown(md) {
  const bloques = [];
  const lineas = md.split(/\r?\n/);

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    const t = l.trim();

    if (!t) { bloques.push({ tipo: "espacio" }); continue; }
    if (/^---+$/.test(t)) { bloques.push({ tipo: "regla" }); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) { bloques.push({ tipo: "titulo", nivel: h[1].length, texto: h[2] }); continue; }

    // Tabla: la cabecera, la línea de guiones y las filas que sigan.
    if (t.startsWith("|") && (lineas[i + 1] ?? "").trim().startsWith("|-")) {
      const celdas = (fila) => fila.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const cabecera = celdas(t);
      const filas = [];
      i += 2;
      while (i < lineas.length && lineas[i].trim().startsWith("|")) {
        filas.push(celdas(lineas[i]));
        i++;
      }
      i--;
      bloques.push({ tipo: "tabla", cabecera, filas });
      continue;
    }

    const li = /^[-*]\s+(.*)$/.exec(t);
    if (li) { bloques.push({ tipo: "vinieta", texto: li[1] }); continue; }

    const num = /^(\d+)\.\s+(.*)$/.exec(t);
    if (num) { bloques.push({ tipo: "vinieta", marca: `${num[1]}.`, texto: num[2] }); continue; }

    bloques.push({ tipo: "parrafo", texto: t });
  }
  return bloques;
}

/** Quita los asteriscos de negrita: se pierde el énfasis, no el texto. */
const limpio = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");

// ─── Dibujo ───────────────────────────────────────────────────────────────────
function generar(bloques, titulo) {
  const paginas = [];
  let ops = [];
  let y = ALTO - MARGEN;

  const nuevaPagina = () => { paginas.push(ops); ops = []; y = ALTO - MARGEN; };
  const sitio = (alto) => { if (y - alto < MARGEN + PIE) nuevaPagina(); };

  const escribir = (texto, { size = 10.5, bold = false, x = MARGEN, gris = 0 } = {}) => {
    ops.push("BT", `/${bold ? "F2" : "F1"} ${size} Tf`, `${gris} g`, `1 0 0 1 ${x} ${y} Tm`,
             `(${pdfTexto(texto)}) Tj`, "ET");
  };

  for (const b of bloques) {
    switch (b.tipo) {
      case "espacio":
        y -= 5;
        break;

      case "regla":
        sitio(18);
        y -= 6;
        ops.push("0.8 g", `${MARGEN} ${y} m ${ANCHO - MARGEN} ${y} l S`, "0 g");
        y -= 12;
        break;

      case "titulo": {
        const size = b.nivel === 1 ? 20 : b.nivel === 2 ? 14 : 11.5;
        sitio(size + 18);
        y -= size + (b.nivel === 1 ? 6 : 10);
        for (const linea of partir(limpio(b.texto), size, true, UTIL)) {
          escribir(linea, { size, bold: true });
          y -= size + 3;
        }
        y -= b.nivel === 1 ? 6 : 3;
        break;
      }

      case "vinieta": {
        const marca = b.marca ?? "·";
        const sangria = MARGEN + 16;
        const lineas = partir(limpio(b.texto), 10.5, false, UTIL - 16);
        sitio(lineas.length * 14);
        escribir(marca, { size: 10.5, bold: !!b.marca });
        for (const linea of lineas) {
          escribir(linea, { size: 10.5, x: sangria });
          y -= 14;
        }
        break;
      }

      case "tabla": {
        const cols = b.cabecera.length;
        const w = UTIL / cols;
        const fila = (celdas, bold) => {
          // Cada celda se parte por su cuenta; la fila mide lo que la más alta.
          const partes = celdas.map((c) => partir(limpio(c), 9, bold, w - 8));
          const alto = Math.max(...partes.map((p) => p.length)) * 12 + 6;
          sitio(alto);
          const yFila = y;
          if (bold) {
            ops.push("0.93 g", `${MARGEN} ${y - alto + 4} ${UTIL} ${alto} re f`, "0 g");
          }
          partes.forEach((lineasCelda, i) => {
            y = yFila - 8;
            for (const linea of lineasCelda) {
              escribir(linea, { size: 9, bold, x: MARGEN + i * w + 4 });
              y -= 12;
            }
          });
          y = yFila - alto;
          ops.push("0.85 g", `${MARGEN} ${y + 2} m ${ANCHO - MARGEN} ${y + 2} l S`, "0 g");
        };
        y -= 6;
        fila(b.cabecera, true);
        for (const f of b.filas) fila(f, false);
        y -= 8;
        break;
      }

      default: {
        const lineas = partir(limpio(b.texto), 10.5, false, UTIL);
        sitio(lineas.length * 14);
        for (const linea of lineas) {
          escribir(linea, { size: 10.5 });
          y -= 14;
        }
        y -= 2;
      }
    }
  }
  paginas.push(ops);

  // Pie con el número de página.
  paginas.forEach((p, i) => {
    p.push("BT", "/F1 8 Tf", "0.45 g", `1 0 0 1 ${MARGEN} ${PIE} Tm`,
           `(${pdfTexto(titulo)}) Tj`, "ET");
    p.push("BT", "/F1 8 Tf", "0.45 g", `1 0 0 1 ${ANCHO - MARGEN - 40} ${PIE} Tm`,
           `(${i + 1} de ${paginas.length}) Tj`, "ET");
  });

  return paginas;
}

// ─── Ensamblado del archivo ───────────────────────────────────────────────────
function serializar(objetos) {
  let out = "%PDF-1.4\n";
  const offsets = [0];
  objetos.forEach((cuerpo, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objetos.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

function construir(paginas) {
  const nPag = paginas.length;
  const idsPagina = [];
  const objetos = [];

  // 1 catálogo · 2 páginas · 3 F1 · 4 F2 · luego (página, contenido) × n
  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  objetos.push("PLACEHOLDER_PAGES");
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  paginas.forEach((ops, i) => {
    const idPagina = 5 + i * 2;
    const idContenido = idPagina + 1;
    idsPagina.push(`${idPagina} 0 R`);
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${idContenido} 0 R >>`,
    );
    const flujo = ops.join("\n");
    objetos.push(`<< /Length ${Buffer.byteLength(flujo, "latin1")} >>\nstream\n${flujo}\nendstream`);
  });

  objetos[1] = `<< /Type /Pages /Kids [${idsPagina.join(" ")}] /Count ${nPag} >>`;
  return serializar(objetos);
}

// ─── Entrada ──────────────────────────────────────────────────────────────────
const [, , entrada, salida] = process.argv;
if (!entrada || !salida) {
  console.error("Uso: node scripts/informe-pdf.mjs <entrada.md> <salida.pdf>");
  process.exit(1);
}

const md = readFileSync(entrada, "utf8");
const bloques = leerMarkdown(md);
const titulo = (bloques.find((b) => b.tipo === "titulo")?.texto ?? "Informe").replace(/\*\*/g, "");
writeFileSync(salida, construir(generar(bloques, titulo)));
console.log(`PDF generado: ${salida}`);
