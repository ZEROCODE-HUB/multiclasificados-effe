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

const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://www.coleffe.com").replace(/\/$/, "");

/**
 * Cuerpo legible del correo.
 *
 * Hasta la 0121 el canal de correo estaba apagado de fábrica y casi nadie lo
 * encendía, así que todo lo que no fuera un mensaje del equipo caía en un
 * "Tienes una nueva notificación" sin decir de qué ni adónde ir. Ahora el
 * correo llega por defecto, y un correo sin contexto ni enlace es peor que no
 * mandarlo: se marca como spam y arrastra al resto. Cada evento dice qué pasó y
 * lleva su enlace, que es lo que pidió el cliente para los avisos por vencer.
 */
// Horas en palabras. Es una COPIA de src/lib/duracion.ts y no un import: una
// Edge Function corre en Deno y no ve el código del front. Si se toca una, hay
// que tocar la otra — los tests comprueban que dicen lo mismo.
function enPalabras(horas: number): string {
  const h = Math.max(0, Math.round(horas));
  if (h < 1) return "menos de una hora";
  if (h < 24) return `${h} ${h === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(h / 24);
  const resto = h % 24;
  const parteDias = `${dias} ${dias === 1 ? "día" : "días"}`;
  return resto === 0 ? parteDias : `${parteDias} y ${resto} ${resto === 1 ? "hora" : "horas"}`;
}

function tiempoDelAviso(transcurridas: unknown, restantes: unknown): string {
  // `Number(null)` y `Number("")` valen CERO, no NaN, así que comprobar solo
  // que sea finito dejaba pasar la ausencia de dato: la alerta acababa
  // diciendo "le quedan menos de una hora" a un aviso recién publicado.
  const cifra = (v: unknown) =>
    v === null || v === undefined || v === "" ? Number.NaN : Number(v);
  const t = cifra(transcurridas);
  const r = cifra(restantes);
  if (!Number.isFinite(t) || !Number.isFinite(r)) return "";
  return `Lleva ${enPalabras(t)} publicado y le ${r === 1 ? "queda" : "quedan"} ${enPalabras(r)}.`;
}

function bodyFor(type: string, payload: Record<string, unknown>): string {
  const p = payload || {};
  const titulo = String(p.listing_title ?? "tu aviso");
  const aviso = p.listing_id ? SITE_URL + "/aviso/" + String(p.listing_id) : null;
  const misAvisos = SITE_URL + "/dashboard/anunciante/avisos";
  /**
   * "Mis avisos" con ESE aviso señalado: la pantalla se abre en su pestaña y lo
   * resalta unos segundos (ver AdvertiserListings).
   *
   * Es a donde tiene que llevar el correo de "está por vencer", y no a la ficha
   * pública. Motivo: la ficha sale de `listing_cards`, que solo trae los
   * ACTIVOS. Basta con que el anunciante lea el correo unas horas tarde —o al
   * día siguiente— para que el aviso ya haya caducado y el enlace no lleve a
   * ninguna parte. Aquí, en cambio, el aviso está siempre: vencido o no, y es
   * justo donde se renueva.
   */
  const avisoEnMisAvisos = p.listing_id
    ? misAvisos + "?aviso=" + encodeURIComponent(String(p.listing_id))
    : misAvisos;
  // Una línea en blanco entre párrafos: la plantilla respeta los saltos.
  const parrafos = (...partes: Array<string | null>) => partes.filter(Boolean).join("\n\n");

  switch (type) {
    case "admin_message":
      return String(p.body ?? "");

    case "listing_expiring": {
      // Las dos cifras que pidió el cliente. Llegan desde la 0133; los avisos
      // anteriores solo traen `dias` y se leen como antes.
      const dias = Number(p.dias);
      const plazo = tiempoDelAviso(p.horas_transcurridas, p.horas_restantes)
        || (Number.isFinite(dias) && dias > 0
          ? `Te quedan ${dias} ${dias === 1 ? "día" : "días"} para renovarlo.`
          : "Está a punto de caducar.");
      // UN solo enlace, y al sitio donde se renueva. Antes iban dos —la ficha
      // pública primero— y el primero es el que se pulsa: llevaba a un aviso
      // que, si ya había caducado, ni siquiera se podía ver.
      return parrafos(
        `Tu aviso "${titulo}" está por vencer. ${plazo}`,
        `Renuévalo aquí: ${avisoEnMisAvisos}`,
        "Cuando vence deja de aparecer en las búsquedas.",
      );
    }

    case "new_message":
      return parrafos(
        String(p.preview ?? "Tienes un mensaje nuevo sobre uno de tus avisos."),
        `Responder: ${SITE_URL}/dashboard/anunciante/mensajes`,
      );

    case "new_application":
      return parrafos(
        `Alguien postuló a tu aviso "${titulo}".`,
        `Ver las postulaciones: ${SITE_URL}/dashboard/anunciante/postulaciones`,
      );

    case "application_status":
      return parrafos(
        `Cambió el estado de tu postulación${p.listing_title ? ` a "${titulo}"` : ""}.`,
        `Ver: ${SITE_URL}/dashboard/buscador/postulaciones`,
      );

    case "new_review":
      return parrafos(
        `Recibiste una reseña${p.rating ? ` de ${String(p.rating)} estrellas` : ""}.`,
        aviso ? `Verla en el aviso: ${aviso}` : `Ver tus avisos: ${misAvisos}`,
      );

    case "saved_search_match":
      return parrafos(
        "Hay avisos nuevos que coinciden con una de tus búsquedas guardadas.",
        `Verlos: ${SITE_URL}/dashboard/buscador/busquedas`,
      );

    case "listing_disabled":
      return parrafos(
        `Tu aviso "${titulo}" fue deshabilitado por moderación${p.reason ? `: ${String(p.reason)}` : "."}`,
        `Ver tus avisos: ${misAvisos}`,
      );

    case "listing_enabled":
      return parrafos(
        `Tu aviso "${titulo}" volvió a estar visible.`,
        aviso ? `Verlo: ${aviso}` : `Tus avisos: ${misAvisos}`,
      );

    default:
      return String(p.body ?? p.preview ?? `Tienes una notificación nueva en eFFe Clasificados: ${SITE_URL}`);
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
