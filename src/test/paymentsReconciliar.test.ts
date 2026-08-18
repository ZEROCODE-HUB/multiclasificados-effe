import { describe, it, expect, vi, beforeEach } from "vitest";

// Rescate de pagos que se quedaron sin confirmar. El caso real: el usuario paga,
// se le corta el internet antes de que Izipay nos avise, y su saldo nunca
// aparece. Al volver a la app se repasan sus órdenes pendientes.

const invoke = vi.fn();
const ordersRows: Array<{ id: string }> = [];
let ordersError: unknown = null;

// Cadena mínima de PostgREST: select().eq().gte().order().limit()
const consulta = () => {
  const res = Promise.resolve({ data: ordersRows, error: ordersError });
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order"]) chain[m] = () => chain;
  chain.limit = () => res;
  chain.then = (f: (v: unknown) => unknown) => res.then(f);
  return chain;
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: () => consulta(),
    rpc: async () => ({ data: 0, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));
vi.mock("@/lib/credits", () => ({ getCreditBalance: async () => 0 }));

import { verificarOrden, ordenesPendientesRecientes, reconciliarOrdenesPendientes } from "@/lib/payments";

beforeEach(() => {
  invoke.mockReset();
  ordersRows.length = 0;
  ordersError = null;
});

describe("verificarOrden", () => {
  it("pregunta a la Edge Function por esa orden concreta", async () => {
    invoke.mockResolvedValue({ data: { success: true, status: "paid", settled: true }, error: null });
    const r = await verificarOrden("ord-1");
    expect(invoke).toHaveBeenCalledWith("verify-payment", { body: { orderId: "ord-1" } });
    expect(r).toEqual({ status: "paid", settled: true });
  });

  it("un estado que no reconoce se trata como pendiente, nunca como cobrado", async () => {
    invoke.mockResolvedValue({ data: { success: true, status: "vaya-usted-a-saber" }, error: null });
    expect((await verificarOrden("ord-1")).status).toBe("pending");
  });

  it("si la función falla, propaga el error (quien llama decide)", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("caída") });
    await expect(verificarOrden("ord-1")).rejects.toThrow("caída");
  });
});

describe("ordenesPendientesRecientes", () => {
  it("devuelve los ids de las órdenes sin confirmar", async () => {
    ordersRows.push({ id: "a" }, { id: "b" });
    expect(await ordenesPendientesRecientes()).toEqual(["a", "b"]);
  });

  it("si la consulta falla, no rompe la app: no hay nada que rescatar", async () => {
    ordersError = new Error("sin red");
    expect(await ordenesPendientesRecientes()).toEqual([]);
  });
});

describe("reconciliarOrdenesPendientes", () => {
  it("verifica cada orden pendiente y cuenta las que se acreditaron", async () => {
    ordersRows.push({ id: "a" }, { id: "b" }, { id: "c" });
    invoke
      .mockResolvedValueOnce({ data: { status: "paid", settled: true }, error: null })
      .mockResolvedValueOnce({ data: { status: "pending" }, error: null })
      .mockResolvedValueOnce({ data: { status: "paid", settled: false }, error: null });

    expect(await reconciliarOrdenesPendientes()).toBe(2);
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it("una orden que revienta no impide revisar las demás", async () => {
    ordersRows.push({ id: "a" }, { id: "b" });
    invoke
      .mockResolvedValueOnce({ data: null, error: new Error("timeout") })
      .mockResolvedValueOnce({ data: { status: "paid", settled: true }, error: null });

    expect(await reconciliarOrdenesPendientes()).toBe(1);
  });

  it("sin órdenes pendientes no llama a nadie", async () => {
    expect(await reconciliarOrdenesPendientes()).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
  });
});
