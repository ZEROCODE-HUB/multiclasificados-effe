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

export interface CreatePaymentInput {
  amountCents: number;   // monto en céntimos (soles × 100), entero
  currency: string;      // "PEN"
  orderId: string;       // id de nuestra orden (uuid)
  email: string;
  firstName?: string;
  lastName?: string;
  identityType?: "DNI" | "RUC" | "CE";
  identityCode?: string;
}

// Payload para POST /api-payment/V4/Charge/CreatePayment.
export function buildCreatePaymentBody(input: CreatePaymentInput): Record<string, unknown> {
  const billingDetails: Record<string, unknown> = { country: "PE" };
  if (input.firstName) billingDetails.firstName = input.firstName;
  if (input.lastName) billingDetails.lastName = input.lastName;
  if (input.identityType) billingDetails.identityType = input.identityType;
  if (input.identityCode) billingDetails.identityCode = input.identityCode;

  return {
    amount: input.amountCents,
    currency: input.currency,
    orderId: input.orderId,
    customer: {
      email: input.email,
      billingDetails,
    },
  };
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
