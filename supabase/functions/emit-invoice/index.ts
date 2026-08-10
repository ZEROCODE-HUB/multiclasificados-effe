// =====================================================================
// emit-invoice — envía al comprador su comprobante de compra de saldo.
//
// La llama la propia base de datos (pg_net) en cuanto se liquida un pago, y
// también el barrido periódico y el botón de reintento del panel.
//
// Principio: esto NUNCA puede costarle créditos al usuario. Cuando llega aquí,
// el pago ya está liquidado y los créditos acreditados; si algo falla, se
// registra, se reintenta luego y se devuelve 200 igual — el estado lo gobierna
// la base de datos, no el código HTTP.
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — acceso a la base
//   INVOICE_WORKER_SECRET  — debe coincidir con system_settings.invoice_worker_secret
//   RESEND_API_KEY         — sin ella no se envía correo (queda 'omitido')
//   INVOICE_EMAIL_FROM     — remitente; por defecto el de pruebas de Resend
//   EMISOR_NOMBRE, EMISOR_RUC — datos que salen impresos en el comprobante
//   PUBLIC_SITE_URL        — para el enlace a "Mis comprobantes"
//
// Deploy: supabase functions deploy emit-invoice --no-verify-jwt
//   (la llama la base de datos, sin sesión; se identifica con el secreto)
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderComprobantePDF, toBase64 } from "../_shared/comprobante-pdf.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const WORKER_SECRET = Deno.env.get("INVOICE_WORKER_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("INVOICE_EMAIL_FROM")
  ?? "eFFe Clasificados <onboarding@resend.dev>";
const EMISOR_NOMBRE = Deno.env.get("EMISOR_NOMBRE") ?? "eFFe Multiclasificados";
const EMISOR_RUC = Deno.env.get("EMISOR_RUC") ?? "";
const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://multiclasificados-effe.vercel.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Comparación en tiempo constante: un `===` filtra el secreto por su duración. */
function secretoValido(recibido: string): boolean {
  if (!WORKER_SECRET || recibido.length !== WORKER_SECRET.length) return false;
  let dif = 0;
  for (let i = 0; i < WORKER_SECRET.length; i++) {
    dif |= WORKER_SECRET.charCodeAt(i) ^ recibido.charCodeAt(i);
  }
  return dif === 0;
}

/** Staff con permiso de edición en el módulo de pagos (reintento manual). */
async function esStaffAutorizado(auth: string | null): Promise<boolean> {
  const token = auth?.replace(/^Bearer\s+/i, "") ?? "";
  // La anon key no identifica a nadie: mismo criterio que verify-doc.
  if (!token || token === ANON_KEY) return false;
  const user = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await user.rpc("has_perm", {
    p_module: "Pagos y planes",
    p_action: "edit",
  });
  return !error && data === true;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const money = (n: number, moneda: string) =>
  `${moneda === "USD" ? "US$" : "S/"} ${Number(n ?? 0).toFixed(2)}`;

function htmlCorreo(inv: Record<string, unknown>, declarado: boolean): string {
  const numero = esc(inv.o_number);
  const total = money(Number(inv.o_amount), "PEN");
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:24px;
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#22262e">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e8ec;border-radius:12px;overflow:hidden">
      <div style="background:#132a4a;color:#fff;padding:20px 24px">
        <div style="font-size:18px;font-weight:800">eFFe Multiclasificados</div>
      </div>
      <div style="padding:24px">
        <h1 style="margin:0 0 8px;font-size:18px">Tu comprobante ${numero}</h1>
        <p style="margin:0 0 16px;color:#5b6270;font-size:14px;line-height:1.6">
          Hola ${esc(inv.o_advertiser_name) || "y gracias por tu compra"}, adjuntamos el
          comprobante de tu compra de saldo.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:8px 0;color:#5b6270">Detalle</td>
              <td style="padding:8px 0;text-align:right">${esc(inv.o_detail)}</td></tr>
          <tr><td style="padding:8px 0;color:#5b6270">Total</td>
              <td style="padding:8px 0;text-align:right;font-weight:700">${total}</td></tr>
        </table>
        ${declarado
          ? ""
          : `<p style="margin:16px 0 0;color:#8a919e;font-size:12px;line-height:1.5">
               Este documento es un comprobante interno de tu compra y no constituye
               documento tributario.</p>`}
        <p style="margin:24px 0 0">
          <a href="${SITE_URL}/dashboard/anunciante/boletas"
             style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;
                    padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px">
            Ver mis comprobantes
          </a>
        </p>
      </div>
    </div></body></html>`;
}

/** Envía el comprobante por correo. Devuelve el resultado, nunca lanza. */
async function enviarCorreo(inv: Record<string, unknown>) {
  const claimId = String(inv.o_claim_id);
  const id = String(inv.o_id);

  if (!RESEND_API_KEY) {
    await admin.rpc("finish_invoice_email", {
      p_invoice_id: id, p_claim_id: claimId, p_status: "omitido",
      p_message_id: null, p_error: "Correo no configurado (falta RESEND_API_KEY)",
    });
    return { email: "omitido" as const };
  }

  const declarado = inv.o_sunat_status === "aceptado" || inv.o_sunat_status === "observado";
  const pdf = renderComprobantePDF({
    numero: String(inv.o_number),
    tipo: inv.o_type === "factura" ? "factura" : "boleta",
    fecha: new Date(String(inv.o_issued_at)),
    clienteNombre: String(inv.o_advertiser_name ?? ""),
    clienteDocTipo: (inv.o_doc_type as string) ?? null,
    clienteDocNumero: (inv.o_doc_number as string) ?? null,
    detalle: String(inv.o_detail ?? "Compra de saldo"),
    subtotal: Number(inv.o_subtotal ?? 0),
    igv: Number(inv.o_igv ?? 0),
    total: Number(inv.o_amount ?? 0),
    moneda: "PEN",
    emisorNombre: EMISOR_NOMBRE,
    emisorRuc: EMISOR_RUC || null,
    sunat: declarado ? { aceptado: true } : null,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [String(inv.o_email)],
        subject: `Comprobante ${inv.o_number} — eFFe Multiclasificados`,
        html: htmlCorreo(inv, declarado),
        attachments: [{ filename: `${inv.o_number}.pdf`, content: toBase64(pdf) }],
      }),
    });
    const cuerpo = await res.json().catch(() => ({}));

    await admin.rpc("log_invoice_attempt", {
      p_invoice_id: id, p_step: "email", p_attempt: Number(inv.o_attempts ?? 1),
      p_http_status: res.status, p_ok: res.ok,
      p_request: { to: inv.o_email, from: EMAIL_FROM },
      p_response: cuerpo,
    });

    await admin.rpc("finish_invoice_email", {
      p_invoice_id: id, p_claim_id: claimId,
      p_status: res.ok ? "enviado" : "error",
      p_message_id: (cuerpo as { id?: string })?.id ?? null,
      p_error: res.ok ? null : `Resend respondió ${res.status}`,
    });
    return { email: res.ok ? ("enviado" as const) : ("error" as const) };
  } catch (e) {
    await admin.rpc("finish_invoice_email", {
      p_invoice_id: id, p_claim_id: claimId, p_status: "error",
      p_message_id: null, p_error: e instanceof Error ? e.message : "fallo de red",
    });
    return { email: "error" as const };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const autorizado =
    secretoValido(req.headers.get("x-worker-secret") ?? "") ||
    (await esStaffAutorizado(req.headers.get("Authorization")));
  if (!autorizado) return json({ error: "No autorizado." }, 401);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Función sin configurar." }, 503);
  }

  let body: { invoice_id?: string; sweep?: boolean; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  // Barrido: la base decide qué toca y vuelve a avisar de cada uno.
  if (body.sweep) {
    const { data, error } = await admin.rpc("sweep_invoice_emissions", {
      p_limit: body.limit ?? 20,
    });
    return json({ ok: !error, despachados: data ?? 0 });
  }

  if (!body.invoice_id) return json({ error: "Falta invoice_id." }, 400);

  // Paso correo. La emisión ante SUNAT entra aquí en la siguiente fase; hasta
  // entonces el comprobante viaja como interno y el correo sale igual.
  const { data: claim, error } = await admin.rpc("claim_invoice_email", {
    p_invoice_id: body.invoice_id,
    p_lease_seconds: 300,
  });
  if (error) {
    console.error("[emit-invoice] no se pudo reclamar:", error.message);
    return json({ ok: false, error: error.message });
  }
  const inv = Array.isArray(claim) ? claim[0] : claim;
  if (!inv) return json({ ok: true, claimed: false });

  const resultado = await enviarCorreo(inv as Record<string, unknown>);
  return json({ ok: true, invoice: inv.o_number, ...resultado });
});
