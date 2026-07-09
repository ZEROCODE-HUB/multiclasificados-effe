import { describe, it, expect, vi, beforeEach } from "vitest";

// Dos contratos del "Historial de acciones importantes":
//
// 1. El rango de fechas se resuelve en el servidor. El borde delicado es "hasta":
//    created_at es timestamptz, así que filtrar por `lte "2026-07-09"` compararía
//    contra la medianoche del 9 y se comería el día entero. Debe llegar el fin
//    del día, en la zona horaria del navegador.
// 2. El CSV que descarga el admin abre bien en Excel: UTF-8 con BOM, o las
//    tildes salen como rombos con signo de interrogación.

const h = vi.hoisted(() => ({
  gte: [] as [string, string][],
  lte: [] as [string, string][],
}));

// Una fila de entidad "setting": así fetchAuditLogs no dispara las búsquedas
// secundarias en `profiles` / `listings` y el mock se mantiene simple.
const FILA = {
  id: 1,
  action: "set_setting",
  entity_type: "setting",
  entity_id: null,
  ip: "190.12.0.1",
  created_at: "2026-07-09T12:00:00Z",
  actor: { full_name: "Rosa Pérez", email: "rosa@correo.com" },
};

vi.mock("@/lib/supabase", () => {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: () => builder,
    gte: (col: string, val: string) => { h.gte.push([col, val]); return builder; },
    lte: (col: string, val: string) => { h.lte.push([col, val]); return builder; },
    order: () => builder,
    limit: () => Promise.resolve({ data: [FILA], error: null }),
    in: () => Promise.resolve({ data: [], error: null }),
  });
  return { supabase: { from: () => builder, auth: { getUser: vi.fn() } } };
});

import { fetchAuditLogs } from "@/lib/admin";
import { exportCSV, exportExcel } from "@/lib/exportReport";

beforeEach(() => {
  h.gte.length = 0;
  h.lte.length = 0;
});

describe("fetchAuditLogs — rango de fechas", () => {
  it("sin rango no aplica ningún filtro de created_at", async () => {
    const { real } = await fetchAuditLogs();
    expect(real).toBe(true);
    expect(h.gte).toHaveLength(0);
    expect(h.lte).toHaveLength(0);
  });

  it("'desde' arranca en la medianoche local de ese día", async () => {
    await fetchAuditLogs({ from: "2026-07-01", to: null });

    expect(h.gte).toHaveLength(1);
    const [col, valor] = h.gte[0];
    expect(col).toBe("created_at");

    const d = new Date(valor);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 1]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
  });

  it("'hasta' incluye el día completo, no se corta en su medianoche", async () => {
    await fetchAuditLogs({ from: null, to: "2026-07-09" });

    expect(h.lte).toHaveLength(1);
    const [col, valor] = h.lte[0];
    expect(col).toBe("created_at");

    // Esta es la regresión: un registro de las 12:00 del día 9 debe entrar.
    expect(new Date("2026-07-09T12:00:00Z") <= new Date(valor)).toBe(true);

    const d = new Date(valor);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 9]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([23, 59, 59]);
  });

  it("un rango completo manda ambos extremos", async () => {
    await fetchAuditLogs({ from: "2026-07-01", to: "2026-07-09" });
    expect(h.gte).toHaveLength(1);
    expect(h.lte).toHaveLength(1);
  });

  it("una fecha inválida se ignora en vez de romper la consulta", async () => {
    const { data } = await fetchAuditLogs({ from: "no-es-fecha", to: null });
    expect(h.gte).toHaveLength(0);
    expect(data.length).toBeGreaterThan(0);
  });
});

describe("exportCSV — codificación que Excel entiende", () => {
  const cap: { blob: Blob | null } = { blob: null };

  // El Blob de jsdom no implementa .text()/.arrayBuffer(); FileReader sí.
  const leerBytes = (b: Blob) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer));
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(b);
    });

  beforeEach(() => {
    cap.blob = null;
    URL.createObjectURL = vi.fn((b: Blob) => { cap.blob = b; return "blob:auditoria"; });
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it("el archivo empieza con BOM y conserva tildes y eñes", async () => {
    exportCSV("auditoria", [
      { "Realizado por": "Rosa Pérez", Acción: "Cambió configuración", "Elemento afectado": "Configuración: diseño" },
    ]);

    expect(cap.blob).not.toBeNull();
    // ignoreBOM: sin esto el decoder se come el U+FEFF y no podríamos afirmarlo.
    const texto = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await leerBytes(cap.blob!));

    expect(texto.startsWith("﻿")).toBe(true);
    expect(texto).toContain("Rosa Pérez");
    expect(texto).toContain("Cambió configuración");
    expect(texto).toContain("Acción");
    expect(texto).toContain("diseño");
    expect(cap.blob!.type).toContain("charset=utf-8");
  });

  it("los bytes son UTF-8 real: 'é' viaja como C3 A9 detrás del BOM EF BB BF", async () => {
    exportCSV("auditoria", [{ Actor: "Pérez" }]);

    const bytes = await leerBytes(cap.blob!);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);

    const i = bytes.indexOf(0xc3);
    expect(i).toBeGreaterThan(-1);
    expect(bytes[i + 1]).toBe(0xa9);
  });

  // El historial se baja como .xls justamente porque el CSV no puede declarar
  // anchos y Excel tapa las fechas con "#######".
  describe("exportExcel — el .xls que descarga el historial", () => {
    const html = async () =>
      new TextDecoder("utf-8", { ignoreBOM: true }).decode(await leerBytes(cap.blob!));

    it("declara un ancho por columna, y la fecha entra entera", async () => {
      exportExcel("auditoria", [{ Registro: "L-1", "Fecha y hora": "07/07/2026 19:45" }], "Historial");
      const h = await html();

      const cols = [...h.matchAll(/<col style="width:(\d+)px">/g)].map((m) => Number(m[1]));
      expect(cols).toHaveLength(2);

      // "07/07/2026 19:45" son 16 caracteres: la columna debe darles lugar.
      expect(cols[1]).toBeGreaterThanOrEqual(16 * 8);
      // Y ninguna columna se dispara a lo ancho de la pantalla.
      cols.forEach((c) => expect(c).toBeLessThanOrEqual(360));
    });

    it("el ancho lo manda el valor más largo, no solo la cabecera", async () => {
      exportExcel("auditoria", [{ IP: "superadmin@multiclasificados.com" }], "Historial");
      const [ancho] = [...(await html()).matchAll(/width:(\d+)px/g)].map((m) => Number(m[1]));
      expect(ancho).toBeGreaterThan("IP".length * 8 + 24);
    });

    it("lleva BOM y mimetype de Excel, y respeta las tildes", async () => {
      exportExcel("auditoria", [{ Acción: "Cambió configuración" }], "Historial");
      const h = await html();

      expect(h.startsWith("﻿")).toBe(true);
      expect(cap.blob!.type).toBe("application/vnd.ms-excel");
      expect(h).toContain("Cambió configuración");
      expect(h).toContain("<meta charset=\"utf-8\">");
    });

    it("escapa el HTML: un '&' o un '<' en el dato no rompen la tabla", async () => {
      exportExcel("auditoria", [{ Actor: 'a&b <script>x</script> "c"' }], "Historial");
      const h = await html();

      expect(h).toContain("a&amp;b &lt;script&gt;x&lt;/script&gt; &quot;c&quot;");
      expect(h).not.toContain("<script>");
    });

    it("sin filas no explota", async () => {
      expect(() => exportExcel("auditoria", [], "Historial")).not.toThrow();
    });
  });
});
