import { describe, it, expect } from "vitest";
import { notificationText, notificationLink, type AppNotification } from "@/lib/notifications";

// 0102: anular una compra le retira saldo al usuario. El aviso tiene que decir
// justo eso —cuánto y por qué—, no un "revisa tus comprobantes" a secas: lo que
// la persona nota es el número que le baja, y sin explicación parece un error.

const mk = (payload: Record<string, unknown>): AppNotification => ({
  id: "n1",
  type: "invoice_voided",
  title: "Se anuló una de tus compras",
  payload,
  read_at: null,
  created_at: "2026-08-15T00:00:00Z",
});

describe("notificación invoice_voided", () => {
  it("dice qué comprobante, cuánto saldo se retiró y por qué", () => {
    expect(notificationText(mk({
      number: "B066-000012", credits: 100, reason: "Cobro duplicado",
    }))).toBe("Se anuló B066-000012 y se retiraron 100 créditos de tu saldo. Motivo: Cobro duplicado");
  });

  it("sin motivo, el aviso sigue siendo comprensible", () => {
    expect(notificationText(mk({ number: "B066-000012", credits: 50 })))
      .toBe("Se anuló B066-000012 y se retiraron 50 créditos de tu saldo.");
  });

  it("si no se pudo retirar nada, no inventa una cifra", () => {
    // Pasa cuando el usuario ya gastó todo lo comprado: la anulación sigue
    // adelante (el admin la confirmó) pero el saldo se queda como está.
    expect(notificationText(mk({ number: "B066-000012", credits: 0, reason: "Fraude" })))
      .toBe("Se anuló B066-000012. Motivo: Fraude");
  });

  it("aguanta un payload vacío sin enseñar 'undefined'", () => {
    expect(notificationText(mk({}))).toBe("Se anuló una de tus compras.");
  });

  it("lleva a Mis comprobantes, donde se ve marcado como anulado", () => {
    expect(notificationLink(mk({ number: "B066-000012" }), "anunciante"))
      .toBe("/dashboard/anunciante/boletas");
    // También para quien tenga rol buscador: el comprobante es suyo igual.
    expect(notificationLink(mk({ number: "B066-000012" }), "buscador"))
      .toBe("/dashboard/anunciante/boletas");
  });
});
