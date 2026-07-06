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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "eFFe Clasificados <onboarding@resend.dev>";

// Cuerpo legible del correo. Para mensajes del admin usa el texto tal cual.
function bodyFor(type: string, payload: Record<string, unknown>): string {
  const p = payload || {};
  switch (type) {
    case "admin_message":
      return String(p.body ?? "");
    default:
      return String(p.body ?? p.preview ?? "Tienes una nueva notificación en eFFe Clasificados.");
  }
}

// Plantilla HTML mínima y neutral (sin dependencias externas).
function htmlEmail(title: string, body: string): string {
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:system-ui,Segoe UI,Arial,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#ffffff;border-radius:12px;padding:28px">
      <h1 style="font-size:18px;margin:0 0 12px">${safe(title)}</h1>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${safe(body)}</div>
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
    const body = bodyFor(record.type, record.payload || {});

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
