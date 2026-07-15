// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  hmacSha256Hex, verifyHash, basicAuthHeader, buildCreatePaymentBody, readAnswer,
} from "../../supabase/functions/_shared/izipay.ts";

/**
 * Valida la criptografía de la integración Izipay sin tocar la red:
 *   - HMAC-SHA256 hex (vector conocido de RFC 4231);
 *   - verifyHash elige la clave según kr-hash-key ("password" vs "sha256_hmac");
 *   - helpers de Basic Auth, payload y lectura del kr-answer.
 */

describe("hmacSha256Hex", () => {
  it("coincide con el vector conocido (RFC 4231, caso 2)", async () => {
    // key="Jefe", data="what do ya want for nothing?" → HMAC-SHA256 conocido.
    const hex = await hmacSha256Hex("what do ya want for nothing?", "Jefe");
    expect(hex).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  });
});

describe("verifyHash — selección de clave por kr-hash-key", () => {
  const krAnswer = JSON.stringify({ orderStatus: "PAID", orderDetails: { orderId: "ord-1" } });
  const PASSWORD = "prodpassword_XXXX";
  const HMAC = "hmacsha256key_YYYY";

  it("kr-hash-key='password' valida con la contraseña REST (IPN)", async () => {
    const hash = await hmacSha256Hex(krAnswer, PASSWORD);
    expect(await verifyHash({ krAnswer, krHash: hash, krHashKey: "password", password: PASSWORD, hmacKey: HMAC })).toBe(true);
    // Firmado con la HMAC pero declarando 'password' → NO valida.
    const wrong = await hmacSha256Hex(krAnswer, HMAC);
    expect(await verifyHash({ krAnswer, krHash: wrong, krHashKey: "password", password: PASSWORD, hmacKey: HMAC })).toBe(false);
  });

  it("kr-hash-key='sha256_hmac' valida con la clave HMAC (retorno navegador)", async () => {
    const hash = await hmacSha256Hex(krAnswer, HMAC);
    expect(await verifyHash({ krAnswer, krHash: hash, krHashKey: "sha256_hmac", password: PASSWORD, hmacKey: HMAC })).toBe(true);
  });

  it("sin kr-hash-key acepta cualquiera de las dos claves", async () => {
    const withPwd = await hmacSha256Hex(krAnswer, PASSWORD);
    const withHmac = await hmacSha256Hex(krAnswer, HMAC);
    expect(await verifyHash({ krAnswer, krHash: withPwd, password: PASSWORD, hmacKey: HMAC })).toBe(true);
    expect(await verifyHash({ krAnswer, krHash: withHmac, password: PASSWORD, hmacKey: HMAC })).toBe(true);
  });

  it("rechaza una firma manipulada o vacía", async () => {
    expect(await verifyHash({ krAnswer, krHash: "deadbeef", krHashKey: "password", password: PASSWORD, hmacKey: HMAC })).toBe(false);
    expect(await verifyHash({ krAnswer, krHash: "", krHashKey: "password", password: PASSWORD, hmacKey: HMAC })).toBe(false);
  });
});

describe("helpers de la API", () => {
  it("basicAuthHeader arma Basic base64(shop:password)", () => {
    // btoa("12345678:testpassword") → conocido.
    expect(basicAuthHeader("12345678", "testpassword")).toBe("Basic " + btoa("12345678:testpassword"));
  });

  it("buildCreatePaymentBody usa céntimos, PEN y billingDetails con país PE", () => {
    const body = buildCreatePaymentBody({
      amountCents: 1614, currency: "PEN", orderId: "ord-9", email: "a@b.com",
      firstName: "JUAN", identityType: "DNI", identityCode: "44443333",
    });
    expect(body.amount).toBe(1614);
    expect(body.currency).toBe("PEN");
    expect(body.orderId).toBe("ord-9");
    const customer = body.customer as { email: string; billingDetails: Record<string, unknown> };
    expect(customer.email).toBe("a@b.com");
    expect(customer.billingDetails.country).toBe("PE");
    expect(customer.billingDetails.identityCode).toBe("44443333");
  });

  it("readAnswer detecta PAID y extrae orderId + uuid de la transacción", () => {
    const r = readAnswer({
      orderStatus: "PAID",
      orderDetails: { orderId: "ord-1" },
      transactions: [{ uuid: "txn-uuid-123" }],
    });
    expect(r).toEqual({ orderId: "ord-1", paid: true, transactionUuid: "txn-uuid-123" });
    expect(readAnswer({ orderStatus: "UNPAID", orderDetails: { orderId: "x" }, transactions: [] }).paid).toBe(false);
  });
});
