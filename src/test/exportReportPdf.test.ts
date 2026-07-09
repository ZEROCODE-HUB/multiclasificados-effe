import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportRows } from "@/lib/exportReport";

// El bug: el botón PDF mostraba "Reporte exportado" pero no descargaba nada.
// exportPDF abría una pestaña y llamaba a window.print(), así que el archivo
// solo existía si el usuario elegía "Guardar como PDF" a mano — y si el
// bloqueador de popups mataba la ventana, no pasaba absolutamente nada.

const rows = [{ Categoría: "Vehículos", Avisos: 12, "Monto S/": 99.5 }];

let clicks: HTMLAnchorElement[];
let revoked: string[];

// El Blob de jsdom no expone arrayBuffer(), así que guardamos lo que se le pasa
// al constructor: es exactamente lo que el navegador acabaría descargando.
class BlobEspia {
  constructor(public parts: unknown[], opts?: { type?: string }) {
    this.type = opts?.type ?? "";
  }
  type: string;
}

beforeEach(() => {
  clicks = [];
  revoked = [];
  vi.stubGlobal("Blob", BlobEspia);
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn((u: string) => revoked.push(u));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push(this);
  });
  vi.spyOn(window, "open").mockImplementation(() => null);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const blobDe = (call: number) =>
  (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls[call][0] as unknown as BlobEspia;

/** Los bytes del PDF son WinAnsi: 1 byte por carácter, se leen como latin1. */
const bytesDe = (blob: BlobEspia) => Buffer.from(blob.parts[0] as Uint8Array).toString("latin1");

describe("exportRows('pdf')", () => {
  it("descarga un archivo .pdf en vez de abrir el diálogo de impresión", () => {
    exportRows("pdf", "reporte-dashboard", "Avisos por categoría", rows);

    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe("reporte-dashboard.pdf");
    expect(window.open).not.toHaveBeenCalled();
  });

  it("el blob descargado es un PDF de verdad, no HTML", () => {
    exportRows("pdf", "reporte", "Título", rows);

    const blob = blobDe(0);
    expect(blob.type).toBe("application/pdf");
    const texto = bytesDe(blob);
    expect(texto.startsWith("%PDF-")).toBe(true);
    expect(texto.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(texto).toContain("Veh\xedculos"); // los datos van dentro
    expect(texto).not.toContain("<table"); // no es la tabla HTML de antes
  });

  it("no revoca el blob antes de que el navegador lo lea", () => {
    exportRows("pdf", "reporte", "Título", rows);
    expect(revoked).toEqual([]); // aún no: la descarga acaba de empezar

    vi.runAllTimers();
    expect(revoked).toEqual(["blob:fake"]);
  });

  it("sigue funcionando sin filas: descarga igual, no lanza", () => {
    expect(() => exportRows("pdf", "vacio", "Sin datos", [])).not.toThrow();
    expect(clicks[0].download).toBe("vacio.pdf");
  });
});

describe("exportRows — CSV y Excel siguen igual", () => {
  it("csv descarga .csv y xlsx descarga .xls", () => {
    exportRows("csv", "r", "T", rows);
    expect(clicks[0].download).toBe("r.csv");
    expect(blobDe(0).type).toContain("text/csv");

    exportRows("xlsx", "r", "T", rows);
    expect(clicks[1].download).toBe("r.xls");
    expect(blobDe(1).type).toBe("application/vnd.ms-excel");
  });
});
