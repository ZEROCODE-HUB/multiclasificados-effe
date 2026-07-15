// Edge Function: payment-webhook (IPN de Izipay/Lyra)
// Segundo paso del cobro: Izipay notifica server-to-server el resultado del pago.
// Esta función es la ÚNICA fuente de verdad que acredita créditos y emite la
// boleta. Valida la firma HMAC-SHA256 del kr-answer y, si el pago está PAGADO,
// llama a settle_paid_order() (idempotente) con service role.
//
// El navegador NO acredita: el frontend solo hace polling del estado de su orden.
//
// Request (POST, application/x-www-form-urlencoded desde Izipay):
//   kr-answer, kr-hash, kr-hash-key, kr-hash-algorithm
//
// Secrets requeridos (Supabase → Edge Functions → Secrets):
//   - IZIPAY_PASSWORD   Clave de producción REST (valida la firma del IPN)
//   - IZIPAY_HMAC_KEY   Clave HMAC-SHA-256 (valida la firma del retorno navegador)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (los inyecta Supabase)
//
// Deploy:  supabase functions deploy payment-webhook --no-verify-jwt
//   (--no-verify-jwt: Izipay no envía JWT de Supabase; la autenticidad se
//    valida por la firma HMAC, no por el gateway.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyHash, readAnswer } from "../_shared/izipay.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const IZIPAY_PASSWORD = Deno.env.get("IZIPAY_PASSWORD") ?? "";
const IZIPAY_HMAC_KEY = Deno.env.get("IZIPAY_HMAC_KEY") ?? "";

// Lee el cuerpo del IPN sea urlencoded, multipart o JSON.
async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    return (j ?? {}) as Record<string, string>;
  }
  const form = await req.formData().catch(() => null);
  if (form) {
    const o: Record<string, string> = {};
    for (const [k, v] of form.entries()) o[k] = typeof v === "string" ? v : "";
    return o;
  }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return new Response("método no permitido", { status: 405 });

  try {
    if (!IZIPAY_PASSWORD && !IZIPAY_HMAC_KEY) {
      // Sin claves no podemos validar nada: no procesamos.
      return new Response("pasarela no configurada", { status: 503 });
    }

    const body = await parseBody(req);
    const krAnswer = body["kr-answer"] ?? "";
    const krHash = body["kr-hash"] ?? "";
    const krHashKey = body["kr-hash-key"];

    if (!krAnswer || !krHash) {
      return new Response("faltan campos de la notificación", { status: 400 });
    }

    // Autenticidad: sin firma válida NO tocamos la base de datos.
    const valid = await verifyHash({
      krAnswer, krHash, krHashKey,
      password: IZIPAY_PASSWORD, hmacKey: IZIPAY_HMAC_KEY,
    });
    if (!valid) return new Response("firma inválida", { status: 401 });

    const answer = JSON.parse(krAnswer) as Record<string, unknown>;
    const { orderId, paid, transactionUuid } = readAnswer(answer);
    if (!orderId) return new Response("sin orderId", { status: 200 });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (paid) {
      // Liquidación idempotente: créditos + boleta una sola vez por orden.
      const { data, error } = await admin.rpc("settle_paid_order", {
        p_order_id: orderId,
        p_payment_ref: transactionUuid,
      });
      if (error) {
        console.error("[payment-webhook] settle_paid_order error:", error.message);
        // 500 → Izipay reintenta la notificación (settle_paid_order es idempotente).
        return new Response("error al liquidar", { status: 500 });
      }
      return new Response(`OK! Order processed: ${JSON.stringify(data)}`, { status: 200 });
    }

    // Pago no aprobado: marcamos la orden como fallida si seguía pendiente
    // (no bloquea, y ayuda a que la UI deje de esperar).
    await admin.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
    return new Response("OK! Payment not accepted", { status: 200 });
  } catch (e) {
    console.error("[payment-webhook]", e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
