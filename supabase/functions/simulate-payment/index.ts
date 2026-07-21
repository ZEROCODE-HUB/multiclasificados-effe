// Edge Function: simulate-payment  ⚠️ SOLO PRUEBAS — NO ES UN COBRO REAL
//
// Simula una compra de saldo SIN pasar por Izipay: crea la orden y la liquida al
// instante con settle_paid_order (lo mismo que hace el webhook cuando Izipay
// confirma). Es la ÚNICA forma de que la simulación genere la boleta real, porque
// settle_paid_order es SECURITY DEFINER concedida solo a service_role y el cliente
// no puede llamarla. La boleta y el saldo salen por el mismo camino que un pago de
// verdad, así que el recibo aparece en "Mis boletas".
//
// ── BLINDAJE ──
// Se niega a correr salvo que el secret ALLOW_FAKE_PAYMENT sea exactamente "true".
// Habilítalo SOLO en un entorno de PRUEBAS/STAGING, nunca en producción: cada
// simulación consume un número real de la serie de boletas (B001-…). El detalle
// se marca "[SIMULADO]" para poder identificarlas y limpiarlas después.
//
// Deploy:
//   supabase functions deploy simulate-payment
//   supabase secrets set ALLOW_FAKE_PAYMENT=true      (solo en staging/pruebas)
//
// Request (POST JSON): igual que create-payment (quantity, duration, extras, receipt)
//   Header: Authorization: Bearer <access_token del USUARIO>
// Response 200: { success, orderId, invoiceNumber, credits, balance }
// Response 403: { success:false, error:"Simulación deshabilitada." }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  priceForDuration, extrasTotal, splitIgv, solesToCredits, settingsFromRow,
  type ExtrasSelection, type DurationDays,
} from "../_shared/pricing.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOW = (Deno.env.get("ALLOW_FAKE_PAYMENT") ?? "").trim() === "true";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DURATIONS = [3, 7, 15, 30, 60, 90];
const EXTRA_LABELS: Record<string, string> = {
  img500: "2ª imagen", pdf500: "Adjuntar PDF", urgente: "Etiqueta Urgente", destacado: "Aviso Destacado",
};

async function authenticatedUserId(req: Request): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === SUPABASE_ANON_KEY) return null;
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
    // Blindaje: sin el flag explícito, esta función no hace absolutamente nada.
    if (!ALLOW) return json({ success: false, error: "Simulación de pago deshabilitada en este entorno." }, 403);

    const userId = await authenticatedUserId(req);
    if (!userId) return json({ success: false, error: "Inicia sesión para simular el pago." }, 401);

    const body = await req.json().catch(() => ({}));
    const quantity = Math.trunc(Number(body?.quantity));
    const duration = Number(body?.duration) as DurationDays;
    const extras = (body?.extras ?? {}) as ExtrasSelection;
    const receipt = (body?.receipt ?? {}) as Record<string, unknown>;

    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10) {
      return json({ success: false, error: "Cantidad de avisos inválida." });
    }
    if (!DURATIONS.includes(duration)) return json({ success: false, error: "Duración inválida." });

    // Datos del comprobante: se usan los del formulario y, si faltan, valores por
    // defecto para que la boleta de prueba se pueda emitir igual.
    const receiptType = receipt.receiptType === "factura" ? "factura" : "boleta";
    const docType = ["dni", "ruc", "ce"].includes(String(receipt.docType)) ? String(receipt.docType) : "dni";
    const docNumber = String(receipt.docNumber ?? "").replace(/\D/g, "") || (docType === "ruc" ? "20000000001" : "00000000");
    const advertiserName = String(receipt.advertiserName ?? "").trim() || "CLIENTE SIMULADO";
    const email = String(receipt.email ?? "").trim() || "simulado@effe.test";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Monto recalculado server-side (idéntico a create-payment).
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
    if (!(total > 0)) return json({ success: false, error: "El importe simulado es inválido." });

    const credits = solesToCredits(total);
    const { subtotal, igv } = splitIgv(total);

    const extraNames = Object.keys(EXTRA_LABELS).filter((k) => (extras as Record<string, unknown>)[k]).map((k) => EXTRA_LABELS[k]);
    // El prefijo [SIMULADO] deja rastro en la boleta y el movimiento de saldo.
    const detail = `[SIMULADO] Compra de saldo: ${quantity} aviso${quantity > 1 ? "s" : ""} · ${duration} días` +
      (extraNames.length ? ` · ${extraNames.join(", ")}` : "");

    // Orden 'pending' con el payload de liquidación (mismo shape que create-payment).
    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        listing_qty: quantity,
        duration_days: duration,
        subtotal, igv, total,
        status: "pending",
        payment_provider: "simulado",
        extras: {
          credits, detail,
          extras_selection: extras,
          receipt: { receiptType, email, advertiserName, docType, docNumber, factilizaData: receipt.factilizaData ?? null },
        },
      })
      .select("id")
      .single();
    if (oErr || !order) return json({ success: false, error: "No se pudo registrar la orden: " + (oErr?.message ?? "") }, 500);

    // Liquidar YA (como el webhook): acredita el saldo y emite la boleta.
    const { data: settled, error: sErr } = await admin.rpc("settle_paid_order", {
      p_order_id: order.id,
      p_payment_ref: "SIMULADO",
    });
    if (sErr) return json({ success: false, error: "No se pudo liquidar la orden simulada: " + sErr.message }, 500);

    // Saldo resultante del usuario.
    const { data: bal } = await admin.from("user_credits").select("balance").eq("user_id", userId).maybeSingle();

    return json({
      success: true,
      orderId: order.id,
      invoiceNumber: (settled as { invoice_number?: string })?.invoice_number ?? "",
      credits,
      balance: Number(bal?.balance ?? 0),
    });
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
