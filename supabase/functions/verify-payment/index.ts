// Edge Function: verify-payment
// Red de seguridad del cobro: le pregunta a Izipay cómo quedó realmente una
// orden, en vez de esperar a que Izipay nos avise.
//
// POR QUÉ EXISTE. Todo el cobro cuelga del IPN (`payment-webhook`): si esa
// llamada no llega —se cortó el internet del comprador justo entonces, nuestra
// función estuvo caída un minuto, la URL del IPN estaba mal configurada— la
// orden se queda en 'pending' para siempre aunque el dinero SÍ se haya cobrado.
// El usuario paga y no recibe nada. Esta función cierra ese agujero.
//
// NO acredita saldo por su cuenta. Consulta el estado y, si está pagada, llama a
// `settle_paid_order`, que es la MISMA función que usa el webhook y que ya es
// idempotente (gate atómico sobre orders.status + índice único sobre
// credit_transactions(order_id)). Si el IPN llegó antes, aquí no pasa nada.
//
// Dos formas de entrar:
//   1) El usuario, desde la app:  { "orderId": "uuid" }
//      con Authorization: Bearer <access_token del usuario>. Solo sus órdenes.
//   2) El barrido de la base:     { "orderId": "uuid", "worker": true }
//      con la cabecera x-worker-secret (ver 0109 y la función
//      public.payment_worker_secret()).
//
// Response (200): { "success": true, "status": "paid" | "pending" | "failed",
//                   "settled": true|false }
//
// Secrets requeridos:
//   - IZIPAY_SHOP_ID, IZIPAY_PASSWORD   (los mismos de create-payment)
//   - IZIPAY_API_HOST                   (opcional)
//   - PAYMENT_WORKER_SECRET             (para la entrada del barrido)
//   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy:  supabase functions deploy verify-payment --no-verify-jwt
//   (--no-verify-jwt porque la base de datos la llama sin JWT; la entrada de
//    usuario valida el token ella misma y la del worker, el secreto.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEFAULT_API_HOST, basicAuthHeader, readOrderGet } from "../_shared/izipay.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const IZIPAY_SHOP_ID = Deno.env.get("IZIPAY_SHOP_ID") ?? "";
const IZIPAY_PASSWORD = Deno.env.get("IZIPAY_PASSWORD") ?? "";
const API_HOST = Deno.env.get("IZIPAY_API_HOST") ?? DEFAULT_API_HOST;
const WORKER_SECRET = Deno.env.get("PAYMENT_WORKER_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Una orden rechazada se cierra, pero no de inmediato: entre que el comprador
// abandona el formulario y lo retoma pueden pasar minutos, y marcarla 'failed'
// antes de tiempo le quitaría la posibilidad de terminar de pagar.
const MINUTOS_ANTES_DE_DARLA_POR_FALLIDA = 15;

// Devuelve el id del usuario dueño del token, o null si no hay usuario real.
async function authenticatedUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  if (token === SUPABASE_ANON_KEY) return null; // la anon key no identifica a nadie
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return typeof user?.id === "string" ? user.id : null;
}

/** Pregunta a Izipay por el estado real. Devuelve null si no se pudo consultar. */
async function consultarEnIzipay(orderId: string, paymentRef: string | null) {
  const auth = basicAuthHeader(IZIPAY_SHOP_ID, IZIPAY_PASSWORD);

  // Con el uuid de la transacción la consulta es directa; si no, se pregunta por
  // la orden entera (que es como la conocemos siempre al crearla).
  const intentos: Array<{ url: string; body: Record<string, unknown> }> = [];
  if (paymentRef) {
    intentos.push({ url: `${API_HOST}/api-payment/V4/Transaction/Get`, body: { uuid: paymentRef } });
  }
  intentos.push({
    url: `${API_HOST}/api-payment/V4/Order/Get`,
    body: { orderId, operationType: "DEBIT" },
  });

  for (const intento of intentos) {
    try {
      const res = await fetch(intento.url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(intento.body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) continue;
      if (data.status === "ERROR") {
        // Orden desconocida para Izipay: probamos el siguiente intento.
        console.error("[verify-payment] Izipay respondió ERROR:", data?.answer?.errorCode, data?.answer?.errorMessage);
        continue;
      }
      return readOrderGet(data.answer as Record<string, unknown>);
    } catch (e) {
      console.error("[verify-payment] fallo consultando a Izipay:", e instanceof Error ? e.message : e);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ success: false, error: "método no permitido" }, 405);

  if (!IZIPAY_SHOP_ID || !IZIPAY_PASSWORD) {
    return json({ success: false, error: "Pasarela de pago no configurada." }, 503);
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const orderId = String(body.orderId ?? "").trim();
  if (!UUID_RE.test(orderId)) return json({ success: false, error: "Orden no válida." }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // ── Quién pregunta ────────────────────────────────────────────────────────
  const secretoRecibido = req.headers.get("x-worker-secret") ?? "";
  const esWorker = !!WORKER_SECRET && secretoRecibido === WORKER_SECRET;

  const { data: orden, error: errOrden } = await admin
    .from("orders")
    .select("id, user_id, status, payment_ref, created_at")
    .eq("id", orderId)
    .maybeSingle();

  if (errOrden || !orden) return json({ success: false, error: "Orden no encontrada." }, 404);

  if (!esWorker) {
    const userId = await authenticatedUserId(req);
    if (!userId) return json({ success: false, error: "Inicia sesión para consultar tu pago." }, 401);
    // Cada quien pregunta por lo suyo. Sin esto, cualquiera con una sesión podría
    // sondear órdenes ajenas y aprender cuándo y cuánto paga otra persona.
    if (orden.user_id !== userId) return json({ success: false, error: "Orden no encontrada." }, 404);
  }

  // Ya liquidada: no hay nada que preguntar ni que arreglar.
  if (orden.status === "paid") return json({ success: true, status: "paid", settled: false, ya: true });
  if (orden.status === "failed") return json({ success: true, status: "failed", settled: false });

  const estado = await consultarEnIzipay(orderId, (orden.payment_ref as string) ?? null);

  if (!estado) {
    await admin.from("orders")
      .update({ verified_at: new Date().toISOString(), verify_last_error: "No se pudo consultar a la pasarela" })
      .eq("id", orderId);
    return json({ success: false, status: "pending", settled: false, error: "No se pudo consultar la pasarela." }, 502);
  }

  if (estado.paid) {
    // ÚNICA vía de acreditación, y es la misma del webhook: idempotente.
    const { data, error } = await admin.rpc("settle_paid_order", {
      p_order_id: orderId,
      p_payment_ref: estado.transactionUuid,
    });
    if (error) {
      console.error("[verify-payment] settle_paid_order falló:", error.message);
      await admin.from("orders")
        .update({ verified_at: new Date().toISOString(), verify_last_error: error.message })
        .eq("id", orderId);
      return json({ success: false, status: "paid", settled: false, error: "No se pudo acreditar." }, 500);
    }
    await admin.from("orders")
      .update({ verified_at: new Date().toISOString(), verify_last_error: null })
      .eq("id", orderId);
    const settled = (data as Record<string, unknown> | null)?.settled === true;
    return json({ success: true, status: "paid", settled });
  }

  if (estado.refused) {
    const edadMin = (Date.now() - new Date(orden.created_at as string).getTime()) / 60000;
    if (edadMin >= MINUTOS_ANTES_DE_DARLA_POR_FALLIDA) {
      // `status <> 'paid'` en el filtro: si el IPN entra justo ahora y la
      // liquida, no la pisamos.
      await admin.from("orders")
        .update({ status: "failed", verified_at: new Date().toISOString(), verify_last_error: `Izipay: ${estado.status}` })
        .eq("id", orderId)
        .eq("status", "pending");
      return json({ success: true, status: "failed", settled: false });
    }
  }

  await admin.from("orders")
    .update({ verified_at: new Date().toISOString(), verify_last_error: null })
    .eq("id", orderId);
  return json({ success: true, status: "pending", settled: false });
});
