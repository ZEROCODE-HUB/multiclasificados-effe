import { describe, it, expect } from "vitest";
import { readOrderGet } from "../../supabase/functions/_shared/izipay.ts";

// Lectura del estado real de una orden en Izipay. Es lo que permite rescatar un
// pago cuyo aviso (IPN) nunca llegó: sin esto, la orden se queda pendiente para
// siempre aunque el dinero se haya cobrado.
describe("readOrderGet", () => {
  it("una orden pagada se reconoce y devuelve el uuid de la transacción", () => {
    const r = readOrderGet({
      orderStatus: "PAID",
      transactions: [{ uuid: "abc-123", status: "PAID" }],
    });
    expect(r.paid).toBe(true);
    expect(r.refused).toBe(false);
    expect(r.pending).toBe(false);
    expect(r.transactionUuid).toBe("abc-123");
  });

  it("con varios intentos, se queda con el uuid del que SÍ se cobró", () => {
    const r = readOrderGet({
      orderStatus: "PAID",
      transactions: [
        { uuid: "fallido", status: "UNPAID" },
        { uuid: "bueno", status: "PAID" },
      ],
    });
    expect(r.paid).toBe(true);
    expect(r.transactionUuid).toBe("bueno");
  });

  it("rechazada, abandonada o caducada: no se va a cobrar nunca", () => {
    for (const estado of ["UNPAID", "ABANDONED", "EXPIRED", "REFUSED", "CANCELLED"]) {
      const r = readOrderGet({ orderStatus: estado, transactions: [{ uuid: "x", status: estado }] });
      expect(r.refused).toBe(true);
      expect(r.paid).toBe(false);
    }
  });

  it("en curso (el comprador sigue tecleando) no es ni pagada ni rechazada", () => {
    const r = readOrderGet({ orderStatus: "RUNNING", transactions: [{ uuid: "x", status: "RUNNING" }] });
    expect(r.pending).toBe(true);
    expect(r.paid).toBe(false);
    expect(r.refused).toBe(false);
  });

  it("una respuesta de Transaction/Get (la transacción suelta) también se entiende", () => {
    const r = readOrderGet({ uuid: "solo-uno", status: "PAID" });
    expect(r.paid).toBe(true);
    expect(r.transactionUuid).toBe("solo-uno");
  });

  it("sin transacciones y sin estado, se trata como pendiente: NUNCA como rechazada", () => {
    // Importante: dar por fallida una orden por una respuesta vacía cerraría un
    // pago que quizá sí se cobró.
    const r = readOrderGet({});
    expect(r.pending).toBe(true);
    expect(r.refused).toBe(false);
    expect(r.transactionUuid).toBeNull();
  });

  it("null o undefined no rompen", () => {
    expect(readOrderGet(null).pending).toBe(true);
    expect(readOrderGet(undefined).paid).toBe(false);
  });

  it("una sola transacción pagada basta aunque la orden aún no lo diga", () => {
    const r = readOrderGet({ orderStatus: "RUNNING", transactions: [{ uuid: "u", status: "PAID" }] });
    expect(r.paid).toBe(true);
  });
});
