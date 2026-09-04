// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  hmacSha256Hex, verifyHash, basicAuthHeader, buildCreatePaymentBody, readAnswer,
  preferencia3DSValida, PREFERENCIA_3DS,
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
    expect(customer.billingDetails.identityType).toBe("DNI");
  });

  // Este bloque existe por un fallo real: comprar como empresa devolvía
  // «Invalid billing identityType» y la compra ni empezaba. Nunca se emitió una
  // sola factura por eso. Lo comprobado aquí es lo que la sonda `probe` de
  // create-payment midió contra la API de Izipay el 15/08/2026.
  describe("facturación a empresa (el bug de 'Invalid billing identityType')", () => {
    const empresa = {
      amountCents: 1000, currency: "PEN", orderId: "ord-emp", email: "pagos@empresa.com",
      firstName: "CONSTRUCTORA DEL SUR SAC", esEmpresa: true,
      legalName: "CONSTRUCTORA DEL SUR SAC",
    } as const;

    it("NUNCA manda identityType cuando el pagador es una empresa", () => {
      const body = buildCreatePaymentBody(empresa);
      const bd = (body.customer as { billingDetails: Record<string, unknown> }).billingDetails;
      // Es EL valor que Izipay rechaza; si vuelve, la compra se rompe otra vez.
      expect(bd.identityType).toBeUndefined();
      expect(bd.identityCode).toBeUndefined();
      // Ningún campo puede valer "RUC": es el valor exacto que Izipay rechaza.
      expect(Object.values(bd)).not.toContain("RUC");
    });

    it("manda la razón social y la categoría de empresa", () => {
      const bd = (buildCreatePaymentBody(empresa).customer as {
        billingDetails: Record<string, unknown>;
      }).billingDetails;
      expect(bd.category).toBe("COMPANY");
      expect(bd.legalName).toBe("CONSTRUCTORA DEL SUR SAC");
      expect(bd.country).toBe("PE");
    });

    it("no toca la forma de persona natural, que es la que ya funcionaba", () => {
      const bd = (buildCreatePaymentBody({
        amountCents: 1000, currency: "PEN", orderId: "ord-p", email: "a@b.com",
        firstName: "MARIA", identityType: "DNI", identityCode: "44443333",
      }).customer as { billingDetails: Record<string, unknown> }).billingDetails;
      expect(bd).toEqual({
        country: "PE", firstName: "MARIA", identityType: "DNI", identityCode: "44443333",
      });
      expect(bd.category).toBeUndefined();
    });

    it("sin razón social sigue siendo un cuerpo válido (no manda campos vacíos)", () => {
      const bd = (buildCreatePaymentBody({
        amountCents: 1000, currency: "PEN", orderId: "ord-x", email: "a@b.com", esEmpresa: true,
      }).customer as { billingDetails: Record<string, unknown> }).billingDetails;
      expect(bd).toEqual({ country: "PE", category: "COMPANY" });
    });
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

describe("la preferencia 3-D Secure", () => {
  /**
   * POR QUÉ SE MANDA ESTE CAMPO.
   *
   * El 04/09/2026 todos los pagos empezaron a fallar con «227 : Autenticación
   * imposible», con la misma tarjeta de prueba y las mismas claves con las que
   * se habían aprobado los 139 anteriores. Le habían activado a la tienda la
   * preferencia «Data Only» y, al no poder completarse esa consulta, la
   * transacción se rechazaba.
   *
   * Izipay documenta que este campo GANA a la configuración de la tienda, así
   * que la decisión deja de depender de lo que toquen en su panel.
   */
  const base = {
    amountCents: 2066, currency: "PEN", orderId: "abc", email: "a@b.pe",
  };

  it("sin preferencia, el campo NO viaja", () => {
    // Es el comportamiento de siempre, y al que se vuelve dejando el ajuste
    // vacío: sin el campo, decide la tienda.
    expect(buildCreatePaymentBody(base)).not.toHaveProperty("strongAuthentication");
    expect(buildCreatePaymentBody({ ...base, strongAuthentication: null }))
      .not.toHaveProperty("strongAuthentication");
  });

  it("con preferencia, viaja en la raíz del cuerpo", () => {
    // En la raíz y no dentro de `customer`: es donde lo espera
    // Charge/CreatePayment.
    const b = buildCreatePaymentBody({ ...base, strongAuthentication: "NO_PREFERENCE" });
    expect(b.strongAuthentication).toBe("NO_PREFERENCE");
  });

  it("un valor inventado se DESCARTA en vez de mandarse", () => {
    // Izipay rechaza el cobro entero si el valor no es de los suyos, y eso se
    // traduce en «no se pudo iniciar el pago» para el comprador. Ante un ajuste
    // mal escrito, mejor el comportamiento de siempre que ningún cobro.
    const b = buildCreatePaymentBody({
      ...base, strongAuthentication: "SIN_3DS" as never,
    });
    expect(b).not.toHaveProperty("strongAuthentication");
  });

  it("los valores admitidos son los de la documentación de Izipay", () => {
    for (const v of ["NO_PREFERENCE", "AUTO", "DISABLED", "CHALLENGE_REQUESTED",
                     "CHALLENGE_MANDATE", "DATA_SHARE_ONLY"]) {
      expect(preferencia3DSValida(v), `falta ${v}`).toBe(true);
    }
    expect(PREFERENCIA_3DS).toHaveLength(6);
    expect(preferencia3DSValida("")).toBe(false);
    expect(preferencia3DSValida(null)).toBe(false);
  });

  it("y no toca nada de lo que ya viajaba", () => {
    // El importe, la moneda y los datos de facturación son lo que lleva meses
    // funcionando: añadir un campo no puede moverlos.
    const sin = buildCreatePaymentBody({ ...base, firstName: "ANA" });
    const con = buildCreatePaymentBody({
      ...base, firstName: "ANA", strongAuthentication: "DISABLED",
    });
    expect({ ...con, strongAuthentication: undefined })
      .toEqual({ ...sin, strongAuthentication: undefined });
  });
});
