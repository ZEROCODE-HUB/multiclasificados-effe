// Edge Function: create-payment
// Primer paso del cobro real con Izipay/Lyra (micuentaweb.pe) para COMPRAR SALDO.
//
// Recibe la CONFIGURACIÓN de la compra (cantidad, duración, adicionales y datos
// del comprobante) — NUNCA el precio. El monto se RECALCULA aquí desde
// pricing_settings (fuente de verdad que edita el admin), se crea la orden en
// estado 'pending' con el payload de liquidación en orders.extras, y se pide el
// formToken a Izipay. La acreditación de créditos y la boleta ocurren después,
// solo cuando el IPN confirma el pago (ver función payment-webhook).
//
// Request (POST JSON):
//   {
//     "quantity": 1, "duration": 7,
//     "extras": { "urgente": true, ... },
//     "receipt": { "receiptType":"boleta","email":"a@b.com","advertiserName":"JUAN",
//                  "docType":"dni","docNumber":"44443333","factilizaData":{...} }
//   }
//   Header obligatorio: Authorization: Bearer <access_token del USUARIO>
//
// Response (200): { "success": true, "orderId": "...", "formToken": "...", "publicKey": "..." }
// Response (401): { "success": false, "error": "Inicia sesión para pagar." }
// Response (503): { "success": false, "error": "Pasarela de pago no configurada." }
//
// Secrets requeridos (Supabase → Edge Functions → Secrets):
//   - IZIPAY_SHOP_ID      Número de tienda (~8 dígitos)
//   - IZIPAY_PASSWORD     Clave de test/producción REST (password del Basic Auth)
//   - IZIPAY_PUBLIC_KEY   (opcional) clave pública; si no, el frontend usa su VITE var
//   - IZIPAY_API_HOST     (opcional) por defecto https://api.micuentaweb.pe
//   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (los inyecta Supabase)
//
// Deploy:  supabase functions deploy create-payment
//   (SIN --no-verify-jwt: el gateway filtra peticiones sin JWT y el código exige
//    un usuario autenticado, rechazando la anon key.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  priceForDuration, extrasTotal, splitIgv, solesToCredits, settingsFromRow,
  type ExtrasSelection, type DurationDays,
} from "../_shared/pricing.ts";
import {
  DEFAULT_API_HOST, basicAuthHeader, buildCreatePaymentBody,
} from "../_shared/izipay.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const IZIPAY_SHOP_ID = Deno.env.get("IZIPAY_SHOP_ID") ?? "";
const IZIPAY_PASSWORD = Deno.env.get("IZIPAY_PASSWORD") ?? "";
const IZIPAY_PUBLIC_KEY = Deno.env.get("IZIPAY_PUBLIC_KEY") ?? "";
const API_HOST = Deno.env.get("IZIPAY_API_HOST") ?? DEFAULT_API_HOST;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DURATIONS = [3, 7, 15, 30, 60, 90];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Etiquetas de los adicionales para el detalle del comprobante (espeja el modal).
const EXTRA_LABELS: Record<string, string> = {
  img500: "2ª imagen", pdf500: "Adjuntar PDF", urgente: "Etiqueta Urgente", destacado: "Aviso Destacado",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Sin credenciales de Izipay no hay cobro posible: fallo claro ANTES de tocar la BD.
    if (!IZIPAY_SHOP_ID || !IZIPAY_PASSWORD) {
      return json({ success: false, error: "Pasarela de pago no configurada." }, 503);
    }

    const userId = await authenticatedUserId(req);
    if (!userId) return json({ success: false, error: "Inicia sesión para pagar." }, 401);

    const body = await req.json().catch(() => ({}));
    const quantity = Math.trunc(Number(body?.quantity));
    const duration = Number(body?.duration) as DurationDays;
    const extras = (body?.extras ?? {}) as ExtrasSelection;
    const receipt = (body?.receipt ?? {}) as Record<string, unknown>;

    // ── Validación de la configuración ──
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10) {
      return json({ success: false, error: "Cantidad de avisos inválida." });
    }
    if (!DURATIONS.includes(duration)) {
      return json({ success: false, error: "Duración inválida." });
    }
    const email = String(receipt.email ?? "").trim();
    if (!EMAIL_RE.test(email)) return json({ success: false, error: "Correo del comprobante inválido." });

    const receiptType = receipt.receiptType === "factura" ? "factura" : "boleta";
    const docType = ["dni", "ruc", "ce"].includes(String(receipt.docType)) ? String(receipt.docType) : "";
    const docNumber = String(receipt.docNumber ?? "").replace(/\D/g, "");
    const advertiserName = String(receipt.advertiserName ?? "").trim();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // ── Recálculo del monto server-side (no confiamos en el cliente) ──
    const { data: pricingRow } = await admin
      .from("pricing_settings")
      .select("base, desc_por_aviso, desc_cantidad, saltos, extras")
      .eq("is_active", true)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const settings = settingsFromRow(pricingRow);
    const base = priceForDuration(quantity, duration, settings);
    const extrasSum = extrasTotal(extras, settings);
    const total = Math.round((base + extrasSum) * 100) / 100;
    if (!(total > 0)) return json({ success: false, error: "El importe a pagar es inválido." });

    const credits = solesToCredits(total);
    const { subtotal, igv } = splitIgv(total);

    // Detalle legible del comprobante (misma forma que el modal).
    const extraNames = Object.keys(EXTRA_LABELS).filter((k) => (extras as Record<string, unknown>)[k]).map((k) => EXTRA_LABELS[k]);
    const detail = `Compra de saldo: ${quantity} aviso${quantity > 1 ? "s" : ""} · ${duration} días` +
      (extraNames.length ? ` · ${extraNames.join(", ")}` : "");

    // ── Crear la orden en 'pending' con el payload de liquidación ──
    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        listing_qty: quantity,
        duration_days: duration,
        subtotal,
        igv,
        total,
        status: "pending",
        payment_provider: "izipay",
        extras: {
          credits,
          detail,
          extras_selection: extras,
          receipt: {
            receiptType,
            email,
            advertiserName,
            docType,
            docNumber,
            factilizaData: receipt.factilizaData ?? null,
          },
        },
      })
      .select("id")
      .single();
    if (oErr || !order) {
      return json({ success: false, error: "No se pudo registrar la orden: " + (oErr?.message ?? "") }, 500);
    }

    // ── Pedir el formToken a Izipay (Charge/CreatePayment) ──
    const payload = buildCreatePaymentBody({
      amountCents: Math.round(total * 100),
      currency: "PEN",
      orderId: order.id,
      email,
      firstName: advertiserName || undefined,
      identityType: docType ? (docType.toUpperCase() as "DNI" | "RUC" | "CE") : undefined,
      identityCode: docNumber || undefined,
    });

    const resp = await fetch(`${API_HOST}/api-payment/V4/Charge/CreatePayment`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(IZIPAY_SHOP_ID, IZIPAY_PASSWORD),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = await resp.json().catch(() => null);

    if (!resp.ok || result?.status !== "SUCCESS" || !result?.answer?.formToken) {
      // El cobro no arrancó: dejamos la orden como 'failed' para no ensuciar 'pending'.
      await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
      const errMsg = result?.answer?.errorMessage ?? result?.answer?.detailedErrorMessage ?? "No se pudo iniciar el pago.";
      return json({ success: false, error: String(errMsg) }, 502);
    }

    return json({
      success: true,
      orderId: order.id,
      formToken: result.answer.formToken as string,
      publicKey: IZIPAY_PUBLIC_KEY || null, // el frontend puede usar su VITE var si esto es null
    });
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
