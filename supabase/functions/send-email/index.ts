// Edge Function: send-email
// Se dispara con el trigger `notifications_email` (pg_net) en INSERT sobre
// `notifications` con channel='email'. Envía el correo vía Resend.
//
// Secrets requeridos (Supabase → Edge Functions → Secrets):
//   - SUPABASE_URL              (lo provee Supabase)
//   - SUPABASE_SERVICE_ROLE_KEY (lo provee Supabase)
//   - RESEND_API_KEY            (tu API key de https://resend.com)
//   - EMAIL_FROM                (remitente verificado, p.ej. "eFFe <no-reply@tudominio.com>")
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cuerpoDeNotificacion, rutaDeNotificacion } from "../_shared/textoDeNotificacion.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "eFFe Clasificados <onboarding@resend.dev>";

const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://www.coleffe.com").replace(/\/$/, "");

/**
 * Cuerpo legible del correo.
 *
 * Ya no decide QUÉ se dice: eso está en `_shared/textoDeNotificacion.ts`, el
 * mismo módulo del que tira el push y copia exacta del que usa la campana. Aquí
 * solo se le añade lo propio del correo, que es el enlace escrito —en un texto
 * no hay dónde pulsar— y alguna coletilla suelta.
 *
 * Antes esto era un `switch` de nueve tipos, y los seis que faltaban (reclamos,
 * advertencias de moderación, boletas anuladas, pagos por Yape confirmados o
 * rechazados y cuentas suspendidas) caían en un "Tienes una notificación nueva"
 * sin decir de qué ni adónde ir. Un correo así se marca como spam y arrastra al
 * resto consigo.
 */
function bodyFor(type: string, payload: Record<string, unknown>, titulo?: string | null): string {
  const p = payload || {};
  const cuerpo = cuerpoDeNotificacion(type, p, titulo);
  const ruta = rutaDeNotificacion(type, p, "anunciante");
  // Una línea en blanco entre párrafos: la plantilla respeta los saltos.
  const parrafos = (...partes: Array<string | null | false>) =>
    partes.filter(Boolean).join("\n\n");

  // Cómo se invita a pulsar, según lo que hay al otro lado.
  const LLAMADA: Record<string, string> = {
    listing_expiring: "Renuévalo aquí",
    new_message: "Responder",
    new_application: "Ver las postulaciones",
    application_status: "Ver tu postulación",
    new_review: "Verla en el aviso",
    saved_search_match: "Ver los avisos",
    complaint_new: "Atenderlo",
    career_new: "Verla",
    invoice_voided: "Ver el comprobante",
    manual_payment_approved: "Ver tus avisos",
    manual_payment_rejected: "Ir a tu panel",
    listing_disabled: "Ver tus avisos",
    listing_enabled: "Ver tus avisos",
    moderation_warning: "Ver tus avisos",
  };

  // El personal entra por su propia rama del panel; `rutaDeNotificacion` la
  // resuelve con el rol, y desde aquí no lo sabemos. Para esos dos tipos se
  // manda a /dashboard/admin, que existe para admin y superadmin (a este último
  // lo redirige su propia pantalla).
  const rutaFinal = (type === "complaint_new" || type === "career_new")
    ? `/dashboard/admin/${type === "complaint_new" ? "reclamaciones" : "postulaciones"}`
    : ruta;

  return parrafos(
    cuerpo,
    rutaFinal ? `${LLAMADA[type] ?? "Verlo"}: ${SITE_URL}${rutaFinal}` : null,
    // Lo que pasa si no se hace nada. Solo donde hay algo que perder.
    type === "listing_expiring" && "Cuando vence deja de aparecer en las búsquedas.",
    type === "complaint_new" && "El plazo legal para responder es de 30 días.",
  );
}


// Plantilla HTML mínima y neutral (sin dependencias externas).
function htmlEmail(title: string, body: string): string {
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  /**
   * El enlace, pulsable.
   *
   * Iba como texto suelto dentro de un <div>: en Gmail se ve subrayado porque
   * él lo detecta solo, pero en Outlook y en varios clientes de escritorio se
   * queda como texto plano y hay que copiarlo a mano. El correo decía
   * "Renuévalo aquí: https://…" y no había dónde pulsar.
   *
   * Se hace DESPUÉS de escapar, sobre el texto ya seguro: así lo que se mete en
   * el href no puede traer comillas ni etiquetas. El paréntesis y el punto
   * finales se dejan fuera del enlace, que si no se los come.
   */
  const conEnlaces = (s: string) =>
    s.replace(/https?:\/\/[^\s<]+[^\s<.,)]/g,
      (u) => `<a href="${u}" style="color:#f97316;font-weight:600">${u}</a>`);
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border-radius:12px;padding:28px">
      <h1 style="font-size:18px;margin:0 0 12px">${safe(title)}</h1>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${conEnlaces(safe(body))}</div>
    </div>
    <p style="font-size:11px;color:#71717a;text-align:center;margin-top:16px">
      eFFe Clasificados · Este es un mensaje del equipo. No respondas a este correo.
    </p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;
    if (!record?.user_id) return new Response("sin user_id", { status: 200 });
    // Solo procesamos las filas de canal email.
    if (record.channel && record.channel !== "email") {
      return new Response("canal ignorado", { status: 200 });
    }
    if (!RESEND_API_KEY) {
      console.warn("send-email: falta RESEND_API_KEY, no se envía");
      return new Response("sin proveedor", { status: 200 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", record.user_id)
      .maybeSingle();

    const to = profile?.email;
    if (!to) return new Response("sin email", { status: 200 });

    const title = record.title || "eFFe Clasificados";
    const body = bodyFor(record.type, record.payload || {}, record.title);

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject: title,
        html: htmlEmail(title, body),
        text: body,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error("Resend error", r.status, err);
      return new Response("error proveedor: " + err, { status: 500 });
    }
    return new Response(JSON.stringify({ sent: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
