import { describe, it, expect, beforeEach } from "vitest";
import { addInvoice, loadInvoices } from "@/lib/pricing";

const base = { email: "a@b.pe", advertiser: "Ana", listingTitle: "Aviso", amount: 16.14, detail: "Boleta" };

// localStorage mock (el jsdom de este entorno no expone Storage completo)
beforeEach(() => {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, "localStorage", { value: mock, configurable: true });
});

describe("comprobantes (addInvoice)", () => {
  it("guarda TODO comprobante: cada publicación añade una fila", () => {
    for (let i = 0; i < 5; i++) addInvoice(base);
    expect(loadInvoices()).toHaveLength(5);
  });

  it("numera de forma correlativa B001-000001, 000002, …", () => {
    const a = addInvoice(base);
    const b = addInvoice(base);
    const c = addInvoice(base);
    expect(a.number).toBe("B001-000001");
    expect(b.number).toBe("B001-000002");
    expect(c.number).toBe("B001-000003");
  });

  it("asigna ids únicos aunque se creen en ráfaga (no se pierden filas por clave duplicada)", () => {
    const ids = Array.from({ length: 50 }, () => addInvoice(base).id);
    expect(new Set(ids).size).toBe(50);
    expect(loadInvoices()).toHaveLength(50);
  });

  it("no reutiliza un número aunque se borren boletas anteriores", () => {
    addInvoice(base); // 000001
    addInvoice(base); // 000002
    // El usuario/borrado deja la lista vacía, pero el correlativo persiste.
    localStorage.setItem("effe:invoices", "[]");
    const next = addInvoice(base);
    expect(next.number).toBe("B001-000003");
  });

  it("guarda el DNI/RUC verificado en el comprobante", () => {
    const inv = addInvoice({ ...base, docNumber: "44443333" });
    expect(inv.docNumber).toBe("44443333");
    expect(loadInvoices()[0].docNumber).toBe("44443333");
  });

  it("respeta el número de serie oficial (BD) cuando se provee", () => {
    const inv = addInvoice({ ...base, number: "B001-000777" });
    expect(inv.number).toBe("B001-000777");
    expect(loadInvoices()[0].number).toBe("B001-000777");
  });

  it("tolera un almacenamiento corrupto sin perder el nuevo comprobante", () => {
    localStorage.setItem("effe:invoices", "no-es-json");
    const inv = addInvoice(base);
    expect(loadInvoices()).toHaveLength(1);
    expect(inv.number).toMatch(/^B001-\d{6}$/);
  });
});
