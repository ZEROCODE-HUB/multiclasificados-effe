// Helpers de integración con Izipay / Lyra (micuentaweb.pe · tecnología PayZen).
// Sin dependencias externas: usa fetch, btoa y Web Crypto (crypto.subtle), todo
// nativo en Deno. Cubre lo que necesitan las dos Edge Functions:
//   - create-payment  → Basic Auth + payload de Charge/CreatePayment
//   - payment-webhook  → validación de la firma HMAC-SHA256 del IPN / retorno.

// Host de la API REST de pago (Perú). Configurable por si cambia el entorno.
export const DEFAULT_API_HOST = "https://api.micuentaweb.pe";

// Cabecera Basic Auth = base64("<ShopID>:<password>").
export function basicAuthHeader(shopId: string, password: string): string {
  return "Basic " + btoa(`${shopId}:${password}`);
}

// HMAC-SHA256(message, key) en hexadecimal (lo que usa Lyra para kr-hash).
export async function hmacSha256Hex(message: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparación en tiempo constante (evita filtrar la firma por timing).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyHashInput {
  krAnswer: string;    // string JSON crudo (kr-answer)
  krHash: string;      // firma recibida (kr-hash)
  krHashKey?: string;  // "password" (IPN) | "sha256_hmac" (retorno navegador)
  password: string;    // clave de producción REST (valida el IPN)
  hmacKey: string;     // clave HMAC-SHA-256 (valida el retorno del navegador)
}

// Valida la firma del kr-answer. Izipay indica con kr-hash-key qué clave usar:
//   - "password"     → la contraseña REST (típico del IPN server-to-server)
//   - "sha256_hmac"  → la clave HMAC-SHA-256 (típico del retorno del navegador)
// Si no viene kr-hash-key, probamos ambas para ser tolerantes.
export async function verifyHash(input: VerifyHashInput): Promise<boolean> {
  const { krAnswer, krHash, krHashKey, password, hmacKey } = input;
  if (!krAnswer || !krHash) return false;

  const keys: string[] = krHashKey === "password"
    ? [password]
    : krHashKey === "sha256_hmac"
      ? [hmacKey]
      : [password, hmacKey]; // sin pista: aceptamos cualquiera de las dos

  for (const key of keys) {
    if (!key) continue;
    const computed = await hmacSha256Hex(krAnswer, key);
    if (timingSafeEqual(computed, krHash)) return true;
  }
  return false;
}

/**
 * ── PREFERENCIA 3-D SECURE ───────────────────────────────────────────
 *
 * POR QUÉ EXISTE ESTO. El 04/09/2026 todos los pagos empezaron a fallar con
 * «227 : Autenticación imposible». Los 139 anteriores, con la MISMA tarjeta de
 * prueba y las mismas claves, se habían aprobado. La diferencia está en el
 * detalle de la transacción en el Back Office:
 *
 *   · antes (02/09):  «Estado final de la autenticación: 3D Secure desactivado»
 *                     → autorización «0 : Transaction Approved»
 *   · después (04/09): «3D Secure desactivado EN LA CONSULTA» + «Rango de la
 *                     tarjeta presente en el cache 3DS2 Visa» → rechazo
 *
 * Es decir: a la tienda le activaron la preferencia «Análisis de riesgo
 * solicitado al DS (Data Only)» y, cuando esa consulta no se puede completar,
 * la transacción se rechaza. No cambió nada de nuestro lado.
 *
 * La documentación de Izipay dice que este campo GANA a la configuración de la
 * tienda: «El valor transmitido en la solicitud de pago es prioritario ante las
 * reglas que el vendedor puede haber definido en su Back Office Vendedor».
 * Así que se manda desde aquí y deja de depender de lo que toquen allí.
 */
export const PREFERENCIA_3DS = [
  // Decide el emisor. El pago SIGUE GARANTIZADO si resuelve sin interacción.
  "NO_PREFERENCE",
  // Igual que el anterior; Izipay documenta los dos.
  "AUTO",
  // Pide una EXENCIÓN de autenticación fuerte: es lo más parecido a como estaba
  // la tienda antes del 04/09. OJO: sin autenticación no hay transferencia de
  // responsabilidad, así que un contracargo lo asume el comercio.
  "DISABLED",
  // Fuerza la ventana del banco.
  "CHALLENGE_REQUESTED",
  "CHALLENGE_MANDATE",
  // Solo América Latina: sin autenticación, pero compartiendo los datos con el
  // emisor por 3DS. Es lo que la tienda tiene puesto hoy y lo que falla.
  "DATA_SHARE_ONLY",
] as const;

export type Preferencia3DS = (typeof PREFERENCIA_3DS)[number];

/** ¿Es un valor que Izipay admite? Lo que no, se descarta y no se manda. */
export function preferencia3DSValida(v: unknown): v is Preferencia3DS {
  return typeof v === "string" && (PREFERENCIA_3DS as readonly string[]).includes(v);
}

export interface CreatePaymentInput {
  amountCents: number;   // monto en céntimos (soles × 100), entero
  currency: string;      // "PEN"
  orderId: string;       // id de nuestra orden (uuid)
  email: string;
  firstName?: string;
  lastName?: string;
  /**
   * Documento de identidad de la PERSONA que paga. OJO: nunca "RUC" — ver
   * `construirBillingDetails`.
   */
  /**
   * Ojo: Lyra solo admite "DNI" y "CE". Un pasaporte se manda como "CE" porque
   * es el único valor no-DNI que acepta —igual que rechaza "RUC"—; el número
   * real viaja de todas formas a SUNAT por `invoices.doc_number`, que es donde
   * importa. A Izipay solo le hace falta cobrar.
   */
  identityType?: "DNI" | "CE";
  identityCode?: string;
  /**
   * Preferencia 3-D Secure. NULO = no se manda y manda la configuración de la
   * tienda; ver `PREFERENCIA_3DS` más abajo.
   */
  strongAuthentication?: Preferencia3DS | null;

  /** true cuando el comprobante es factura: el pagador es una empresa. */
  esEmpresa?: boolean;
  /** Razón social, solo si `esEmpresa`. */
  legalName?: string;
  /** País del pagador (ISO-3166-1 alpha-2). Por defecto PE. */
  country?: string;
}

/**
 * Arma `customer.billingDetails`.
 *
 * Lo que hay que saber, porque costó un bug en producción: **Lyra rechaza
 * `identityType:"RUC"`** con «Invalid billing identityType», y el rechazo llega
 * antes de crear el formToken, así que la compra ni empieza. En su modelo,
 * `identityType`/`identityCode` describen el documento de la PERSONA que paga
 * (DNI, carné de extranjería), no el de una empresa.
 *
 * Por eso, cuando el comprobante es una factura, aquí NO se manda el RUC: a
 * Izipay solo le hace falta cobrar. El RUC va por nuestro lado a la boleta
 * electrónica (`invoices.doc_number` → SUNAT), que es donde importa.
 *
 * La rama de persona natural se deja EXACTAMENTE como estaba: es la que lleva
 * meses funcionando y no hay por qué moverla.
 */
export function construirBillingDetails(input: CreatePaymentInput): Record<string, unknown> {
  // El país ya no es siempre PE: desde que se admite comprar con pasaporte o
  // carné de extranjería, quien paga puede estar fuera del Perú.
  const pais = (input.country ?? "PE").trim().toUpperCase();
  const billingDetails: Record<string, unknown> = {
    country: /^[A-Z]{2}$/.test(pais) ? pais : "PE",
  };

  if (input.esEmpresa) {
    // Comprobado contra la API de Izipay (sonda `probe` de create-payment,
    // 15/08/2026): `category:"COMPANY"` + `legalName` lo acepta;
    // `identityType:"RUC"` es el ÚNICO que rechaza.
    billingDetails.category = "COMPANY";
    const razon = input.legalName || input.firstName;
    if (razon) {
      billingDetails.legalName = razon;
      // También como `firstName`: es el campo que Lyra enseña en su panel.
      billingDetails.firstName = razon;
    }
    return billingDetails;
  }

  if (input.firstName) billingDetails.firstName = input.firstName;
  if (input.lastName) billingDetails.lastName = input.lastName;
  if (input.identityType) billingDetails.identityType = input.identityType;
  if (input.identityCode) billingDetails.identityCode = input.identityCode;
  return billingDetails;
}

// Payload para POST /api-payment/V4/Charge/CreatePayment.
export function buildCreatePaymentBody(input: CreatePaymentInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    amount: input.amountCents,
    currency: input.currency,
    orderId: input.orderId,
    customer: {
      email: input.email,
      billingDetails: construirBillingDetails(input),
    },
  };
  // Solo se manda si hay preferencia. Sin el campo, decide la tienda — que es
  // como estuvo hasta hoy y a lo que se vuelve poniendo el ajuste a "".
  if (preferencia3DSValida(input.strongAuthentication)) {
    body.strongAuthentication = input.strongAuthentication;
  }
  return body;
}

// Extrae del kr-answer (ya parseado) el orderId y si el pago fue aceptado.
// Lyra devuelve orderStatus === "PAID" cuando la transacción se aprobó.
export function readAnswer(answer: Record<string, unknown>): {
  orderId: string | null;
  paid: boolean;
  transactionUuid: string | null;
} {
  const orderStatus = String(answer?.orderStatus ?? "");
  const orderId = (answer?.orderDetails as Record<string, unknown> | undefined)?.orderId;
  const txs = answer?.transactions as Array<Record<string, unknown>> | undefined;
  const uuid = Array.isArray(txs) && txs.length ? txs[0]?.uuid : undefined;
  return {
    orderId: typeof orderId === "string" ? orderId : null,
    paid: orderStatus === "PAID",
    transactionUuid: typeof uuid === "string" ? uuid : null,
  };
}

/**
 * Estado real de una orden según Izipay, leído de `Order/Get` o `Transaction/Get`.
 *
 * Hace falta porque el IPN puede no llegar nunca (la red del comprador se cae,
 * nuestra función está caída un minuto, la URL está mal configurada). Cuando eso
 * pasa, la orden se queda en 'pending' para siempre aunque el dinero SÍ se haya
 * cobrado. Preguntando por el estado se recupera sin depender del aviso.
 *
 * Lyra devuelve el estado a nivel de orden (`orderStatus`) y también por
 * transacción; se miran los dos porque `Transaction/Get` no trae el primero.
 */
export interface OrderGetResult {
  paid: boolean;
  /** Rechazada, abandonada o caducada: no va a cobrarse nunca. */
  refused: boolean;
  /** Sigue en curso (el comprador está tecleando la tarjeta, 3-D Secure...). */
  pending: boolean;
  transactionUuid: string | null;
  status: string;
}

const ESTADOS_RECHAZO = ["UNPAID", "ABANDONED", "EXPIRED", "REFUSED", "CANCELLED"];

export function readOrderGet(answer: Record<string, unknown> | null | undefined): OrderGetResult {
  const a = (answer ?? {}) as Record<string, unknown>;
  // `Order/Get` responde { orderStatus, transactions: [...] }; `Transaction/Get`
  // responde la transacción suelta, con su `status`/`detailedStatus`.
  const txs = Array.isArray(a.transactions)
    ? (a.transactions as Array<Record<string, unknown>>)
    : (a.uuid ? [a] : []);

  const estados = [String(a.orderStatus ?? ""), ...txs.map((t) => String(t?.status ?? ""))]
    .map((e) => e.toUpperCase())
    .filter(Boolean);

  const paid = estados.includes("PAID");
  const refused = !paid && estados.length > 0 && estados.every((e) => ESTADOS_RECHAZO.includes(e));

  // El uuid de una transacción PAGADA es el que interesa como referencia; si no
  // hay, vale el de la última intentada.
  const pagada = txs.find((t) => String(t?.status ?? "").toUpperCase() === "PAID");
  const uuid = (pagada ?? txs[txs.length - 1])?.uuid;

  return {
    paid,
    refused,
    pending: !paid && !refused,
    transactionUuid: typeof uuid === "string" ? uuid : null,
    status: estados[0] ?? "",
  };
}
