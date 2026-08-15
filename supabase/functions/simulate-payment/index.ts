// Edge Function: simulate-payment  ⚠️ SOLO PRUEBAS — NO ES UN COBRO REAL
//
// Hace lo mismo que create-payment + payment-webhook juntos, pero sin pasar por
// Izipay: crea la orden y la liquida en el acto con `settle_paid_order`, que es
// exactamente lo que hace el webhook cuando Izipay confirma. Por ese camino
// salen el saldo, el comprobante y —en el modo pagar y publicar— la publicación
// del aviso, igual que en un pago de verdad.
//
// Es la única forma de llamar a `settle_paid_order`: está concedida solo a
// service_role, así que el navegador no puede.
//
// ── POR QUÉ EXISTE ──
// Sin esto, probar el circuito completo exige una tarjeta y que Izipay esté de
// buenas. Con esto se puede verificar de punta a punta: comprobante, envío a
// SUNAT y correo.
//
// ── BLINDAJE (DOS cerrojos, y hacen falta los dos) ──
//
//  1. El secret ALLOW_FAKE_PAYMENT tiene que ser exactamente "true".
//  2. Quien llama tiene que ser STAFF con permiso en «Pagos y planes».
//
// El segundo cerrojo se añadió el 2026-08-15 tras comprobar el agujero: con
// solo el flag, CUALQUIER usuario con sesión podía llamar a esta función y
// acreditarse el saldo que quisiera. Se verificó con una cuenta normal, que se
// regaló créditos sin ser staff. Un flag de entorno no es un permiso.
//
// Las órdenes quedan marcadas con payment_provider='simulado' y
// payment_ref='SIMULADO', que es lo que usan:
//   · los paneles (migraciones 0094/0097) para NO contarlas como ingresos;
//   · settle_paid_order (migración 0098) para emitir con la serie de PRUEBAS y
//     no quemar correlativos de la serie real.
//
// Deploy:
//   supabase functions deploy simulate-payment
//   supabase secrets set ALLOW_FAKE_PAYMENT=true
//
// Request (POST JSON) — igual que create-payment, en sus dos modos:
//   A) { quantity, duration, extras, receipt }          ← comprar saldo
//   B) { listingId, duration?, receipt }                ← pagar y publicar
//   Header: Authorization: Bearer <access_token del USUARIO>
//
// Response 200: { success, orderId, invoiceNumber, credits, balance, published }
// Response 403: { success:false, error:"Simulación de pago deshabilitada…" }

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLICABLES = ["draft", "pending", "expired"];
const MIN_CHARGE_PEN = 1;
const round2 = (n: number) => Math.round(n * 100) / 100;

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

/**
 * Segundo cerrojo: solo staff con permiso de edición en pagos.
 *
 * Lo comprueba `has_perm` en la base de datos con el JWT de quien llama, así que
 * no se puede falsear desde el cliente.
 */
async function esStaffAutorizado(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token === SUPABASE_ANON_KEY) return false;
  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await user.rpc("has_perm", { p_module: "Pagos y planes", p_action: "edit" });
  return !error && data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Sin el flag explícito esta función no hace absolutamente nada.
    if (!ALLOW) {
      return json({ success: false, error: "Simulación de pago deshabilitada en este entorno." }, 403);
    }

    const userId = await authenticatedUserId(req);
    if (!userId) return json({ success: false, error: "Inicia sesión para simular el pago." }, 401);

    // El flag de entorno NO es un permiso: sin esto, cualquier usuario con
    // sesión podría acreditarse el saldo que quisiera.
    if (!(await esStaffAutorizado(req))) {
      return json({ success: false, error: "Solo el personal autorizado puede simular pagos." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listingId ?? "").trim();
    const receipt = (body?.receipt ?? {}) as Record<string, unknown>;

    // Datos del comprobante. A diferencia de create-payment se admiten valores
    // por defecto: una prueba no debería atascarse por un campo del formulario.
    const receiptType = receipt.receiptType === "factura" ? "factura" : "boleta";
    const docType = ["dni", "ruc", "ce"].includes(String(receipt.docType))
      ? String(receipt.docType)
      : (receiptType === "factura" ? "ruc" : "dni");
    const docNumber = String(receipt.docNumber ?? "").replace(/\D/g, "")
      || (docType === "ruc" ? "20000000001" : "00000000");
    const advertiserName = String(receipt.advertiserName ?? "").trim() || "CLIENTE SIMULADO";
    const email = String(receipt.email ?? "").trim() || "simulado@coleffe.com";

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    let total: number;
    let detail: string;
    let orderQty: number;
    let orderDuration: number;
    let purposeExtras: Record<string, unknown> = {};
    let listingCost: number | null = null;

    if (listingId) {
      // ══ Modo B: pagar y publicar ══ (mismas reglas que create-payment)
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

      let duration = Number(listing.plan_duration_days);
      if (body?.duration !== undefined && body?.duration !== null) {
        const asked = Number(body.duration);
        if (!DURATIONS.includes(asked)) return json({ success: false, error: "Duración inválida." });
        duration = asked;
      }
      if (!DURATIONS.includes(duration)) duration = 7;
      if (duration !== Number(listing.plan_duration_days)) {
        await admin.from("listings").update({ plan_duration_days: duration }).eq("id", listingId);
      }

      const { data: costo, error: cErr } = await admin
        .rpc("effe_listing_cost", { p_listing: listingId, p_dias: duration });
      if (cErr || costo === null) {
        return json({ success: false, error: "No se pudo calcular el costo del aviso." }, 500);
      }
      listingCost = round2(Number(costo));

      const { data: credRow } = await admin
        .from("user_credits").select("balance").eq("user_id", userId).maybeSingle();
      const falta = round2(Math.max(listingCost - round2(Number(credRow?.balance ?? 0)), 0));
      if (falta <= 0) {
        return json({ success: false, code: "SALDO_SUFICIENTE", error: "Ya tienes saldo suficiente para publicar." });
      }

      total = Math.max(falta, MIN_CHARGE_PEN);
      detail = `[SIMULADO] Publicación de aviso: ${String(listing.title ?? "").slice(0, 110)}`;
      orderQty = Math.max(1, Number(listing.plan_quantity ?? 1));
      orderDuration = duration;
      purposeExtras = {
        purpose: "publish", listing_id: listingId,
        duration_days: duration, listing_cost: listingCost,
      };
    } else {
      // ══ Modo A: comprar saldo ══
      const quantity = Math.trunc(Number(body?.quantity));
      const duration = Number(body?.duration) as DurationDays;
      const extras = (body?.extras ?? {}) as ExtrasSelection;

      if (!Number.isFinite(quantity) || quantity < 1 || quantity > 10) {
        return json({ success: false, error: "Cantidad de avisos inválida." });
      }
      if (!DURATIONS.includes(duration)) return json({ success: false, error: "Duración inválida." });

      const { data: pricingRow } = await admin
        .from("pricing_settings")
        .select("base, desc_por_aviso, desc_cantidad, saltos, extras")
        .eq("is_active", true)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const settings = settingsFromRow(pricingRow);
      const base = priceForDuration(quantity, duration, settings);
      // Los adicionales se cobran POR DÍA publicado. Si esto se calculara de
      // otra forma que en create-payment, la simulación cobraría un importe que
      // no existe y las pruebas no valdrían para nada.
      const extrasSum = extrasTotal(extras, duration, settings);
      total = round2(base + extrasSum);

      const extraNames = Object.keys(EXTRA_LABELS)
        .filter((k) => (extras as Record<string, unknown>)[k]).map((k) => EXTRA_LABELS[k]);
      detail = `[SIMULADO] Compra de saldo: ${quantity} aviso${quantity > 1 ? "s" : ""} · ${duration} días` +
        (extraNames.length ? ` · ${extraNames.join(", ")}` : "");
      orderQty = quantity;
      orderDuration = duration;
      purposeExtras = { extras_selection: extras };
    }

    if (!(total > 0)) return json({ success: false, error: "El importe simulado es inválido." });

    const credits = solesToCredits(total);
    const { subtotal, igv } = splitIgv(total);

    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        user_id: userId,
        listing_qty: orderQty,
        duration_days: orderDuration,
        subtotal, igv, total,
        status: "pending",
        payment_provider: "simulado",
        extras: {
          credits, detail, ...purposeExtras,
          receipt: {
            receiptType, email, advertiserName, docType, docNumber,
            factilizaData: receipt.factilizaData ?? null,
          },
        },
      })
      .select("id")
      .single();
    if (oErr || !order) {
      return json({ success: false, error: "No se pudo registrar la orden: " + (oErr?.message ?? "") }, 500);
    }

    if (listingId) {
      await admin.from("order_listings").insert({ order_id: order.id, listing_id: listingId });
    }

    // Liquidar YA, como haría el webhook: acredita, emite el comprobante y
    // publica el aviso si la orden venía atada a uno.
    const { data: settled, error: sErr } = await admin.rpc("settle_paid_order", {
      p_order_id: order.id,
      p_payment_ref: "SIMULADO",
    });
    if (sErr) {
      return json({ success: false, error: "No se pudo liquidar la orden simulada: " + sErr.message }, 500);
    }

    const { data: bal } = await admin
      .from("user_credits").select("balance").eq("user_id", userId).maybeSingle();

    const r = (settled ?? {}) as { invoice_number?: string; published?: boolean | null; es_prueba?: boolean };
    return json({
      success: true,
      orderId: order.id,
      invoiceNumber: r.invoice_number ?? "",
      credits,
      amount: total,
      listingCost,
      balance: Number(bal?.balance ?? 0),
      published: r.published ?? null,
      esPrueba: r.es_prueba ?? true,
    });
  } catch (e) {
    return json({ success: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
