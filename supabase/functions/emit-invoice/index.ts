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
import {
  construirComprobante, leerRespuesta, consultaDeComprobante, ComprobanteInvalido,
} from "../_shared/factiliza.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const WORKER_SECRET = Deno.env.get("INVOICE_WORKER_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("INVOICE_EMAIL_FROM")
  ?? "eFFe Clasificados <onboarding@resend.dev>";
const EMISOR_NOMBRE = Deno.env.get("EMISOR_NOMBRE") ?? "eFFe Multiclasificados";
const EMISOR_RUC = Deno.env.get("EMISOR_RUC") ?? "";
const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://www.coleffe.com";

// ─── Factiliza ────────────────────────────────────────────────────────────────
// El mismo token que ya usa verify-doc para consultar DNI/RUC.
const FACTILIZA_TOKEN = Deno.env.get("FACTILIZA_TOKEN") ?? "";
// Por defecto el entorno de PRUEBAS que publica su documentación. Emitir de
// verdad tiene que ser una decisión explícita, no lo que pasa por olvidarse de
// configurar una variable.
//
// ⚠️ Comprobado el 2026-08-11: ese host de QA responde 404 —también en su raíz—,
// o sea que no está en pie. El endpoint que SÍ existe es el de producción,
// `https://apife.factiliza.com/api/v1/invoice/send`, que contesta 401 sin token.
//
// Se deja el de pruebas como valor por defecto A PROPÓSITO: si nadie configura
// nada, la emisión FALLA en vez de mandar un documento fiscal de verdad sin
// querer. Fallar cerrado. Antes de apuntar a producción hay que preguntarle a su
// soporte si la cuenta está en modo demo (sus respuestas de ejemplo empiezan por
// "DEMO - …", así que parece haber un interruptor por cuenta) o cuál es la URL
// de pruebas vigente.
const FACTILIZA_URL = Deno.env.get("FACTILIZA_INVOICE_URL")
  ?? "https://apife-qa.factiliza.com/api/v1/invoice/send";

/**
 * Días que puede pasar un comprobante en cola antes de dejar de intentarlo.
 *
 * SUNAT rechaza los comprobantes fuera de plazo, y la fecha de emisión se
 * congela en el primer intento (la fija la BD, ver 0083). Un comprobante que se
 * quedó atascado porque faltaba configuración NO puede enviarse un mes después
 * con la fecha vieja: pasa a revisión y lo resuelve contabilidad. Sin esto, el
 * día que se enciendan los secrets se dispararía una avalancha de rechazos.
 */
const DIAS_DE_PLAZO = 5;

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

/** La misma base que el envío, cambiando el último tramo. */
const urlDeFactiliza = (recurso: "send" | "cdr" | "pdf" | "xml") =>
  FACTILIZA_URL.replace(/\/send$/, `/${recurso}`);

/**
 * Pregunta a Factiliza si un comprobante ya existe. Es una LECTURA: no emite
 * nada, no consume correlativo y se puede lanzar sin miedo.
 *
 * Se usa para dos cosas: comprobar credenciales sin poner en circulación ningún
 * documento, y —antes de reenviar— saber si el anterior llegó de verdad. Un
 * envío que se cortó después de llegar a Factiliza pero antes de que
 * guardáramos su respuesta deja un documento emitido que nosotros creemos
 * pendiente; reenviarlo lo emitiría dos veces.
 */
async function consultarEnFactiliza(
  tipo: "boleta" | "factura", serie: string, correlativo: number | string,
): Promise<{ http: number; cuerpo: unknown }> {
  const res = await fetch(urlDeFactiliza("cdr"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FACTILIZA_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(consultaDeComprobante(EMISOR_RUC, tipo, serie, correlativo)),
  });
  const texto = await res.text();
  let cuerpo: unknown = texto;
  try { cuerpo = JSON.parse(texto); } catch { /* puede devolver el fichero en crudo */ }
  return { http: res.status, cuerpo };
}

/**
 * Emite el comprobante ante SUNAT a través de Factiliza.
 *
 * Nunca lanza y nunca bloquea nada: si no se puede emitir, el comprobante queda
 * marcado y el correo sale igual, como documento interno. El usuario ya pagó.
 *
 * Devuelve el desenlace, o null si no había nada que emitir (que es el caso
 * normal mientras la emisión esté apagada).
 */
async function emitirEnSunat(invoiceId: string): Promise<string | null> {
  const { data: claim, error } = await admin.rpc("claim_invoice_emission", {
    p_invoice_id: invoiceId,
    p_lease_seconds: 300,
  });
  if (error) {
    console.error("[emit-invoice] no se pudo reclamar la emisión:", error.message);
    return null;
  }
  const inv = (Array.isArray(claim) ? claim[0] : claim) as Record<string, unknown> | null;
  if (!inv) return null; // no toca: ya emitido, omitido, o reclamado por otro

  const id = String(inv.o_id);
  const claimId = String(inv.o_claim_id);
  const intento = Number(inv.o_attempts ?? 1);

  const rendirse = async (motivo: string) => {
    await admin.rpc("mark_invoice_skipped", { p_invoice_id: id, p_reason: motivo });
    return "omitido";
  };

  if (!FACTILIZA_TOKEN) return await rendirse("Falta FACTILIZA_TOKEN en la función");
  if (!EMISOR_RUC) return await rendirse("Falta el RUC del emisor (EMISOR_RUC)");

  // Plazo: la fecha se congeló en el primer intento y no se recalcula.
  const emitida = new Date(String(inv.o_fecha_emision ?? Date.now()));
  const dias = (Date.now() - emitida.getTime()) / 86_400_000;
  if (dias > DIAS_DE_PLAZO) {
    await admin.rpc("finish_invoice_emission", {
      p_invoice_id: id, p_claim_id: claimId, p_status: "vencido",
      p_error_message: `Fuera de plazo: la fecha de emisión es de hace ${Math.floor(dias)} días`,
      p_needs_review: true,
    });
    return "vencido";
  }

  // La dirección fiscal, si Factiliza la devolvió al verificar el documento.
  const ficha = (inv.o_factiliza_data ?? {}) as Record<string, unknown>;
  const direccion = [ficha.direccion, ficha.direccion_completa, ficha.domicilio_fiscal]
    .find((v) => typeof v === "string" && v.trim()) as string | undefined;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = construirComprobante({
      tipo: inv.o_type === "factura" ? "factura" : "boleta",
      serie: String(inv.o_serie),
      correlativo: Number(inv.o_correlativo),
      fechaEmision: emitida,
      emisorRuc: EMISOR_RUC,
      clienteDocTipo: (inv.o_doc_type as "dni" | "ruc" | null) ?? null,
      clienteDocNumero: (inv.o_doc_number as string) ?? null,
      clienteNombre: String(inv.o_advertiser_name ?? ""),
      clienteDireccion: direccion ?? null,
      descripcion: String(inv.o_detail ?? "Compra de saldo"),
      total: Number(inv.o_amount ?? 0),
      subtotal: Number(inv.o_subtotal ?? 0),
      igv: Number(inv.o_igv ?? 0),
      idBaseDato: id,
    });
  } catch (e) {
    // Los datos no dan un documento válido. No se gasta un envío: esto no se
    // arregla reintentando, lo tiene que mirar alguien.
    const motivo = e instanceof ComprobanteInvalido ? e.message : "No se pudo construir el comprobante";
    await admin.rpc("finish_invoice_emission", {
      p_invoice_id: id, p_claim_id: claimId, p_status: "rechazado",
      p_error_code: "LOCAL", p_error_message: motivo, p_needs_review: true,
    });
    return "rechazado";
  }

  let httpStatus = 0;
  let respuesta: unknown = null;
  try {
    const res = await fetch(FACTILIZA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FACTILIZA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
    });
    httpStatus = res.status;
    respuesta = await res.json().catch(() => null);
  } catch (e) {
    respuesta = { message: e instanceof Error ? e.message : "fallo de red" };
  }

  const r = leerRespuesta(httpStatus, respuesta);

  await admin.rpc("log_invoice_attempt", {
    p_invoice_id: id, p_step: "sunat", p_attempt: intento,
    p_http_status: httpStatus, p_ok: r.desenlace === "aceptado" || r.desenlace === "observado",
    // El cuerpo enviado queda guardado: sin él, reconstruir por qué SUNAT
    // rechazó un comprobante de hace tres semanas es adivinar.
    p_request: cuerpo,
    p_response: (respuesta ?? { message: r.mensaje }) as Record<string, unknown>,
  });

  await admin.rpc("finish_invoice_emission", {
    p_invoice_id: id,
    p_claim_id: claimId,
    p_status: r.desenlace,
    p_hash: r.hash,
    p_cdr: r.cdr,
    p_cdr_zip: r.cdrZip,
    p_error_code: r.codigo,
    p_error_message: r.desenlace === "aceptado" ? null : r.mensaje,
    p_needs_review: r.desenlace === "rechazado" || r.desenlace === "observado",
  });

  return r.desenlace;
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

  let body: {
    invoice_id?: string; sweep?: boolean; limit?: number;
    probe?: boolean; serie?: string; correlativo?: string | number; tipo?: "boleta" | "factura";
  } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  // Comprobación de credenciales SIN emitir nada. Consulta un comprobante y
  // devuelve tal cual lo que conteste Factiliza, para poder verificar que el
  // token vale para la API de facturación antes de encender nada.
  if (body.probe) {
    if (!FACTILIZA_TOKEN) return json({ ok: false, error: "Falta FACTILIZA_TOKEN." });
    if (!EMISOR_RUC) return json({ ok: false, error: "Falta EMISOR_RUC." });
    // Se prueban las DOS APIs con el MISMO token, porque un 401 en facturación
    // significa cosas muy distintas según lo que conteste la de consultas:
    //   · consultas OK  + facturación 401 → el token no cubre facturación
    //   · las dos 401                     → el token no vale (caducado o mal)
    const facturacion = await consultarEnFactiliza(
      body.tipo === "factura" ? "factura" : "boleta",
      body.serie ?? "B001",
      body.correlativo ?? 1,
    ).catch((e) => ({ http: 0, cuerpo: String(e) }));

    let consultas: { http: number; ok: boolean } = { http: 0, ok: false };
    try {
      const r = await fetch(`https://api.factiliza.com/v1/ruc/info/${EMISOR_RUC}`, {
        headers: { Authorization: `Bearer ${FACTILIZA_TOKEN}`, Accept: "application/json" },
      });
      consultas = { http: r.status, ok: r.ok };
    } catch { /* se queda en 0 */ }

    return json({
      ok: true,
      emisor: EMISOR_RUC,
      facturacion: { url: urlDeFactiliza("cdr"), ...facturacion },
      consultas: { url: "https://api.factiliza.com/v1/ruc/info/…", ...consultas },
      diagnostico:
        consultas.ok && facturacion.http === 401
          ? "El token vale para consultas pero NO para facturación: son productos distintos."
          : !consultas.ok && facturacion.http === 401
            ? "El token no vale en ninguna de las dos: caducado o incorrecto."
            : facturacion.http === 404
              ? "La ruta de facturación no existe en esa URL."
              : "Ver los códigos de arriba.",
    });
  }

  // Barrido: la base decide qué toca y vuelve a avisar de cada uno.
  if (body.sweep) {
    const { data, error } = await admin.rpc("sweep_invoice_emissions", {
      p_limit: body.limit ?? 20,
    });
    return json({ ok: !error, despachados: data ?? 0 });
  }

  if (!body.invoice_id) return json({ error: "Falta invoice_id." }, 400);

  // Paso 1 — emisión ante SUNAT. Va DELANTE del correo para que, cuando el
  // comprobante sea fiscal, el PDF que se adjunta ya lo diga. Si la emisión está
  // apagada esto no hace nada y el comprobante viaja como interno.
  const sunat = await emitirEnSunat(body.invoice_id);

  // Paso 2 — correo. Sale pase lo que pase con SUNAT: el usuario ya pagó y tiene
  // derecho a su comprobante aunque la emisión fiscal esté atascada.
  const { data: claim, error } = await admin.rpc("claim_invoice_email", {
    p_invoice_id: body.invoice_id,
    p_lease_seconds: 300,
  });
  if (error) {
    console.error("[emit-invoice] no se pudo reclamar:", error.message);
    return json({ ok: false, error: error.message });
  }
  const inv = Array.isArray(claim) ? claim[0] : claim;
  if (!inv) return json({ ok: true, claimed: false, sunat });

  const resultado = await enviarCorreo(inv as Record<string, unknown>);
  return json({ ok: true, invoice: inv.o_number, sunat, ...resultado });
});
