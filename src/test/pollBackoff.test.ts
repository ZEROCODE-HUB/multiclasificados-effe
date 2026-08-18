import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }) }),
    rpc: async () => ({ data: 0, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  },
}));

import { esperaDelSondeo, pollOrderStatus } from "@/lib/payments";

describe("esperaDelSondeo", () => {
  it("empieza rápido y va aflojando", () => {
    // El aviso de pago de Izipay llega entre 1 y 10 s; con 1,5 s fijos se perdía
    // hasta un ciclo entero justo al principio, que es cuando el usuario mira.
    expect(esperaDelSondeo(0)).toBe(300);
    expect(esperaDelSondeo(1)).toBe(600);
    expect(esperaDelSondeo(2)).toBe(1000);
    expect(esperaDelSondeo(3)).toBe(1500);
    expect(esperaDelSondeo(50)).toBe(1500);
  });

  it("nunca pasa del máximo pedido", () => {
    expect(esperaDelSondeo(0, 200)).toBe(200);
    expect(esperaDelSondeo(9, 200)).toBe(200);
  });
});

describe("pollOrderStatus", () => {
  beforeEach(() => maybeSingle.mockReset());

  it("devuelve 'paid' en cuanto el webhook marca la orden", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "paid" } });
    await expect(pollOrderStatus("o1")).resolves.toBe("paid");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("una orden rechazada no se sigue sondeando", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "failed" } });
    await expect(pollOrderStatus("o1")).resolves.toBe("failed");
  });

  it("cerrar el cuadro corta el sondeo: no se consulta ni una vez más", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "pending" } });
    const signal = { aborted: false };
    const p = pollOrderStatus("o1", { intervalMs: 5, timeoutMs: 2000, signal });
    await new Promise((r) => setTimeout(r, 30));
    signal.aborted = true;
    await expect(p).resolves.toBe("timeout");
    const llamadas = maybeSingle.mock.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(maybeSingle.mock.calls.length).toBe(llamadas);
  });
});
