// Edge Function: create-payment
// Primer paso del cobro real con Izipay/Lyra (micuentaweb.pe).
//
// Tiene DOS modos, y en ninguno de los dos el cliente envía el precio: el monto
// se recalcula siempre aquí.
//
//   A) COMPRAR SALDO — recibe la configuración (cantidad, duración, adicionales)
//      y cobra ese paquete. El importe sale de pricing_settings.
//
//   B) PAGAR Y PUBLICAR — recibe el id de un aviso propio en borrador y cobra
//      solo lo que le FALTA al usuario para publicarlo (costo − saldo). El
//      importe lo calcula la base de datos con effe_listing_cost(), que es la
//      misma cuenta que hace publish_listing al cobrar. La orden queda atada al
//      aviso (extras.purpose='publish'), y settle_paid_order lo publica en
//      cuanto el IPN confirma el pago: el usuario puede cerrar la app.
//
// En ambos casos se crea la orden en 'pending' con el payload de liquidación en
// orders.extras y se pide el formToken a Izipay. La acreditación de créditos,
// la boleta y (modo B) la publicación ocurren después, solo cuando el IPN
// confirma el pago (ver función payment-webhook).
//
// Request (POST JSON) — modo A:
//   {
//     "quantity": 1, "duration": 7,
//     "extras": { "urgente": true, ... },
//     "receipt": { "receiptType":"boleta","email":"a@b.com","advertiserName":"JUAN",
//                  "docType":"dni","docNumber":"44443333","factilizaData":{...} }
//   }
//
// Request (POST JSON) — modo B:
//   { "listingId": "uuid", "duration": 30, "receipt": { ...igual que arriba... } }
//   `duration` es opcional; si viene, se guarda en el aviso para que el cobro y
//   la publicación usen la misma. Si no viene, manda la del aviso.
//
//   Header obligatorio: Authorization: Bearer <access_token del USUARIO>
//
// Response (200): { "success": true, "orderId": "...", "formToken": "...",
//                   "publicKey": "...", "amount": 6.14, "listingCost": 16.14 }
// Response (200): { "success": false, "code": "SALDO_SUFICIENTE" }  ← modo B, ya puede publicar
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Estados desde los que un aviso puede publicarse (los mismos que acepta
// effe_publish_listing; 'expired' es republicar).
const PUBLICABLES = ["draft", "pending", "expired"];

// Piso de cobro. Un cargo de S/ 0.14 es rechazo casi seguro del emisor, así que
// cuando falta menos que esto se cobra el mínimo y la diferencia le queda al
// usuario como saldo a favor.
const MIN_CHARGE_PEN = 1;

const round2 = (n: number) => Math.round(n * 100) / 100;

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
    const listingId = String(body?.listingId ?? "").trim();
    const receipt = (body?.receipt ?? {}) as Record<string, unknown>;

    // ── Datos del comprobante (comunes a los dos modos) ──
    const email = String(receipt.email ?? "").trim();
    if (!EMAIL_RE.test(email)) return json({ success: false, error: "Correo del comprobante inválido." });

    const receiptType = receipt.receiptType === "factura" ? "factura" : "boleta";
    const docType = ["dni", "ruc", "ce"].includes(String(receipt.docType)) ? String(receipt.docType) : "";
    const docNumber = String(receipt.docNumber ?? "").replace(/\D/g, "");
    const advertiserName = String(receipt.advertiserName ?? "").trim();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Lo que cada modo tiene que dejar resuelto antes de crear la orden.
    let total: number;
    let detail: string;
    let orderQty: number;
    let orderDuration: number;
    let purposeExtras: Record<string, unknown> = {};
    let listingCost: number | null = null;

    if (listingId) {
      // ══ Modo B: pagar y publicar un aviso concreto ══
      if (!UUID_RE.test(listingId)) return json({ success: false, error: "Aviso inválido." });

      const { data: listing } = await admin
        .from("listings")
        .select("id, owner_id, status, title, plan_duration_days, plan_quantity")
        .eq("id", listingId)
        .maybeSingle();

      if (!listing || listing.owner_id !== userId) {
        return json({ success: false, error: "Aviso no encontrado." }, 403);
      }
      if (!PUBLICABLES.includes(String(listing.status))) {
        return json({ success: false, error: "Este aviso ya está publicado." }, 409);
      }

      // La duración que se cobra y la que se publica tienen que ser la MISMA, y
      // la fuente de verdad es el aviso. Si el cliente manda una válida (el
      // diálogo de borradores deja cambiarla), se guarda en el aviso primero.
      let duration = Number(listing.plan_duration_days);
      if (body?.duration !== undefined && body?.duration !== null) {
        const asked = Number(body.duration);
        if (!DURATIONS.includes(asked)) return json({ success: false, error: "Duración inválida." });
        duration = asked;
      }
      // Los borradores anteriores a la 0041 no guardaron plan: el cliente asume
      // 7 días en ese caso (asDuration en PublishDraftDialog) y aquí igual.
      if (!DURATIONS.includes(duration)) duration = 7;
      if (duration !== Number(listing.plan_duration_days)) {
        // El aviso es la fuente de verdad de la duración: si no se guarda aquí,
        // se cobraría por unos días y se publicaría por otros.
        await admin.from("listings").update({ plan_duration_days: duration }).eq("id", listingId);
      }

      // El costo lo calcula la BD: misma función que usará publish_listing al
      // cobrar, promociones de la categoría incluidas.
      const { data: costo, error: cErr } = await admin
        .rpc("effe_listing_cost", { p_listing: listingId, p_dias: duration });
      if (cErr || costo === null) {
        return json({ success: false, error: "No se pudo calcular el costo del aviso." }, 500);
      }
      listingCost = round2(Number(costo));

      const { data: credRow } = await admin
        .from("user_credits").select("balance").eq("user_id", userId).maybeSingle();
      const balance = round2(Number(credRow?.balance ?? 0));

      const falta = round2(Math.max(listingCost - balance, 0));
      if (falta <= 0) {
        // Ya le alcanza: no hay nada que cobrar. El front publica directo.
        return json({ success: false, code: "SALDO_SUFICIENTE", error: "Ya tienes saldo suficiente para publicar." });
      }

      total = Math.max(falta, MIN_CHARGE_PEN);
      detail = `Publicación de aviso: ${String(listing.title ?? "").slice(0, 120)}`;
      orderQty = Math.max(1, Number(listing.plan_quantity ?? 1));
      orderDuration = duration;
      purposeExtras = {
        purpose: "publish",
        listing_id: listingId,
        duration_days: duration,
        listing_cost: listingCost,
      };
    } else {
      // ══ Modo A: comprar saldo (configurador) ══
      const quantity = Math.trunc(Number(body?.quantity));
      const duration = Number(body?.duration) as DurationDays;
      const extras = (body?.extras ?? {}) as ExtrasSelection;

      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10) {
        return json({ success: false, error: "Cantidad de avisos inválida." });
      }
      if (!DURATIONS.includes(duration)) {
        return json({ success: false, error: "Duración inválida." });
      }

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
      // Los adicionales se cobran por día publicado: la duración entra en la cuenta.
      const extrasSum = extrasTotal(extras, duration, settings);
      total = round2(base + extrasSum);

      // Detalle legible del comprobante (misma forma que el modal).
      const extraNames = Object.keys(EXTRA_LABELS)
        .filter((k) => (extras as Record<string, unknown>)[k]).map((k) => EXTRA_LABELS[k]);
      detail = `Compra de saldo: ${quantity} aviso${quantity > 1 ? "s" : ""} · ${duration} días` +
        (extraNames.length ? ` · ${extraNames.join(", ")}` : "");
      orderQty = quantity;
      orderDuration = duration;
      purposeExtras = { extras_selection: extras };
    }

    if (!(total > 0)) return json({ success: false, error: "El importe a pagar es inválido." });

    const credits = solesToCredits(total);
    const { subtotal, igv } = splitIgv(total);

    // ── Crear la orden en 'pending' con el payload de liquidación ──
    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        listing_qty: orderQty,
        duration_days: orderDuration,
        subtotal,
        igv,
        total,
        status: "pending",
        payment_provider: "izipay",
        extras: {
          credits,
          detail,
          ...purposeExtras,
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

    // Vínculo orden↔aviso, para poder rastrear en el admin qué pago publicó qué
    // aviso. No es la fuente de verdad de la liquidación (esa es extras), así
    // que si falla no se aborta el cobro.
    if (listingId) {
      await admin.from("order_listings").insert({ order_id: order.id, listing_id: listingId });
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
      amount: total,
      listingCost,
    });
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
