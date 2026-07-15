import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del cliente Supabase: controlamos functions.invoke y from().select()...
const invoke = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    from: (...a: unknown[]) => from(...a),
  },
}));

import { createPayment, pollOrderStatus, type PurchaseConfig } from "@/lib/payments";

const config: PurchaseConfig = {
  quantity: 1,
  duration: 7,
  extras: { urgente: true },
  receipt: { receiptType: "boleta", email: "a@b.com", advertiserName: "JUAN", docType: "dni", docNumber: "44443333" },
};

beforeEach(() => {
  invoke.mockReset();
  maybeSingle.mockReset();
});

describe("createPayment", () => {
  it("envía la CONFIG (sin precio) a la Edge Function y devuelve el formToken", async () => {
    invoke.mockResolvedValue({ data: { success: true, orderId: "ord-1", formToken: "tok", publicKey: "pk-1" }, error: null });
    const r = await createPayment(config);
    expect(invoke).toHaveBeenCalledWith("create-payment", { body: config });
    // No se envía ningún importe/precio en el body.
    const sentBody = invoke.mock.calls[0][1].body;
    expect(sentBody).not.toHaveProperty("total");
    expect(sentBody).not.toHaveProperty("amount");
    expect(r).toEqual({ orderId: "ord-1", formToken: "tok", publicKey: "pk-1" });
  });

  it("data.success=false → lanza el error de la función", async () => {
    invoke.mockResolvedValue({ data: { success: false, error: "Pasarela de pago no configurada." }, error: null });
    await expect(createPayment(config)).rejects.toThrow(/no configurada/);
  });

  it("error de función → extrae error.context.json().error", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "non-2xx", context: { json: async () => ({ error: "Inicia sesión para pagar." }) } },
    });
    await expect(createPayment(config)).rejects.toThrow("Inicia sesión para pagar.");
  });
});

describe("pollOrderStatus", () => {
  it("resuelve 'paid' cuando la orden pasa a paid", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { status: "pending" } })
      .mockResolvedValueOnce({ data: { status: "paid" } });
    const outcome = await pollOrderStatus("ord-1", { intervalMs: 1, timeoutMs: 1000 });
    expect(outcome).toBe("paid");
    expect(from).toHaveBeenCalledWith("orders");
  });

  it("resuelve 'failed' cuando la orden falla", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "failed" } });
    expect(await pollOrderStatus("ord-1", { intervalMs: 1, timeoutMs: 1000 })).toBe("failed");
  });

  it("resuelve 'timeout' si nunca sale de pending", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "pending" } });
    expect(await pollOrderStatus("ord-1", { intervalMs: 1, timeoutMs: 20 })).toBe("timeout");
  });
});
