// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderTablePDF } from "@/lib/pdf";

// Los bytes del PDF son WinAnsi (1 byte por carácter), no UTF-8: hay que leerlos
// como latin1 o los offsets del xref no cuadran con los índices del string.
const asText = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

const filas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ Categoría: `Fila ${i}`, Avisos: i, "Monto S/": i * 1.5 }));

const base = { title: "Reporte", headers: ["Categoría", "Avisos", "Monto S/"] };

describe("renderTablePDF — el fichero es un PDF válido", () => {
  it("empieza por la cabecera %PDF y termina en %%EOF", () => {
    const pdf = asText(renderTablePDF({ ...base, rows: filas(3) }));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("cada offset del xref apunta al inicio real de su objeto", () => {
    // Es LO que rompe un lector de PDF si te equivocas en un solo byte.
    const pdf = asText(renderTablePDF({ ...base, subtitle: "sub", rows: filas(40) }));

    const startxref = Number(/startxref\s+(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");

    const size = Number(/\/Size (\d+)/.exec(pdf)![1]);
    const entradas = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entradas).toHaveLength(size - 1); // -1: la entrada 0 es la libre "f"

    entradas.forEach((offset, i) => {
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${i + 1} 0 obj\\n`));
    });
  });

  it("declara tantas páginas como hojas produce, y las pagina de verdad", () => {
    const una = asText(renderTablePDF({ ...base, rows: filas(5) }));
    expect(/\/Count (\d+)/.exec(una)![1]).toBe("1");
    expect(una).not.toContain("Página 2 de");

    const varias = asText(renderTablePDF({ ...base, rows: filas(120) }));
    const count = Number(/\/Count (\d+)/.exec(varias)![1]);
    expect(count).toBeGreaterThan(1);
    // El pie de la última hoja tiene que concordar con /Count.
    expect(varias).toContain(`Página ${count} de ${count}`);
    // Y ningún /Kids colgando: tantas referencias de página como Count.
    expect(/\/Kids \[([^\]]*)\]/.exec(varias)![1].match(/\d+ 0 R/g)).toHaveLength(count);
  });

  it("declara /Length con la longitud real del stream", () => {
    const pdf = asText(renderTablePDF({ ...base, rows: filas(3) }));
    const m = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(pdf)!;
    expect(m[2]).toHaveLength(Number(m[1]));
  });
});

describe("renderTablePDF — texto", () => {
  it("escribe los acentos y la ñ como un solo byte WinAnsi", () => {
    const pdf = asText(renderTablePDF({ ...base, rows: [{ Categoría: "Vehículos ñ", Avisos: 1, "Monto S/": 2 }] }));
    // "í" es 0xED y "ñ" 0xF1 en WinAnsi. Si se hubiera colado UTF-8 saldrían dos bytes.
    expect(pdf).toContain("Veh\xedculos \xf1");
    expect(pdf).not.toContain("Ã");
  });

  it("escapa los paréntesis y la barra invertida, que delimitan los literales de PDF", () => {
    const pdf = asText(renderTablePDF({ title: "Reporte (2026) C:\\datos", headers: ["A"], rows: [{ A: "x)y" }] }));
    expect(pdf).toContain("Reporte \\(2026\\) C:\\\\datos");
    expect(pdf).toContain("(x\\)y) Tj");
  });

  it("sustituye por '?' lo que WinAnsi no sabe representar, sin romper el fichero", () => {
    const pdf = asText(renderTablePDF({ title: "Reporte 中文", headers: ["A"], rows: [{ A: "ok" }] }));
    expect(pdf).toContain("Reporte ??");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
  });

  it("sin filas produce un PDF con el aviso, no un fichero vacío ni una excepción", () => {
    const pdf = asText(renderTablePDF({ title: "Reporte", headers: [], rows: [] }));
    expect(pdf).toContain("Sin datos");
    expect(/\/Count (\d+)/.exec(pdf)![1]).toBe("1");
  });
});
