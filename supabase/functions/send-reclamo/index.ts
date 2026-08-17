// Edge Function: send-reclamo (Libro de Reclamaciones)
//
// Recibe el reclamo desde la página principal, lo guarda en `public.complaints`
// (con service_role) y manda DOS correos:
//
//   1. Al CONSUMIDOR — el acuse de recibo. Es una obligación del Reglamento del
//      Libro de Reclamaciones cuando deja su correo: confirmar la recepción,
//      remitirle copia de la hoja que ingresó y dejar constancia de la fecha y
//      hora del registro. Hasta el 17-ago-2026 esto no se hacía: el reclamo se
//      guardaba y se avisaba a la empresa, y al consumidor no le llegaba nada.
//   2. Al buzón de la empresa (RECLAMOS_TO) — el aviso interno de siempre.
//
// El acuse va primero porque es el obligatorio, y su resultado queda anotado en
// la propia fila (`ack_email_*`): si mañana hay que demostrar que se envió, la
// prueba tiene que estar en el Libro, no en los registros de Resend.
//
// Secrets requeridos (Supabase → Edge Functions → Secrets):
//   - SUPABASE_URL                (lo provee Supabase)
//   - SUPABASE_SERVICE_ROLE_KEY   (lo provee Supabase)
//   - RESEND_API_KEY              (API key de https://resend.com)
//   - RECLAMOS_FROM (opcional)    remitente de un dominio verificado en Resend.
//                                 OJO: sin dominio verificado (el default
//                                 onboarding@resend.dev) Resend SOLO entrega al
//                                 dueño de la cuenta, así que el acuse al
//                                 consumidor no llegaría.
//   - RECLAMOS_TO (opcional)      destinatarios internos separados por coma. Por
//                                 defecto avisos@coleffe.com (buzón real del
//                                 cPanel; ojo, reclamos@/soporte@ NO existen).
//   - RECLAMOS_REPLY_TO (opcional) buzón al que contesta el consumidor si
//                                 responde el acuse. Por defecto, el primero de
//                                 RECLAMOS_TO — nunca el remitente, que puede
//                                 ser una dirección sin buzón detrás.
//
// Deploy:  supabase functions deploy send-reclamo --no-verify-jwt
//   (--no-verify-jwt para permitir reclamos de visitantes sin sesión)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { toBase64 } from "../_shared/pdf-basico.ts";
import {
  type DatosHoja,
  correoAcuseAlConsumidor,
  correoAvisoInterno,
  renderHojaReclamacionPDF,
} from "../_shared/hoja-reclamacion.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Destinatarios internos. Usar SIEMPRE buzones que existan de verdad en el
// cPanel: un destinatario inexistente rebota y el aviso del reclamo se pierde.
const TO = (Deno.env.get("RECLAMOS_TO") ?? "avisos@coleffe.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const REPLY_TO = Deno.env.get("RECLAMOS_REPLY_TO") ?? TO[0] ?? "avisos@coleffe.com";

// Un relato puede ser largo, pero no infinito: sin tope, un envío automatizado
// llenaría la tabla y el PDF crecería sin límite.
const MAX_TEXTO = 3000;

/** Manda un correo por Resend. Devuelve el id del mensaje o el error, sin lanzar. */
async function enviarPorResend(
  apiKey: string,
  payload: unknown,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const texto = await resp.text();
    if (!resp.ok) return { ok: false, error: `${resp.status} ${texto}`.slice(0, 500) };
    let id: string | null = null;
    try {
      id = JSON.parse(texto)?.id ?? null;
    } catch {
      /* Resend contestó 200 sin JSON; el envío igual salió */
    }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 500) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM = Deno.env.get("RECLAMOS_FROM") ?? "Libro de Reclamaciones <onboarding@resend.dev>";

  try {
    const b = await req.json().catch(() => null);
    if (!b) return json({ error: "Cuerpo inválido" }, 400);

    // Validación de los campos obligatorios.
    const required = ["fullName", "docNumber", "email", "description", "request"];
    for (const f of required) {
      if (!b[f] || String(b[f]).trim() === "") {
        return json({ error: `Falta el campo: ${f}` }, 400);
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) {
      return json({ error: "Correo electrónico inválido" }, 400);
    }

    const kind = b.kind === "queja" ? "queja" : "reclamo";
    const goodType = b.good_type === "producto" || b.goodType === "producto" ? "producto" : "servicio";
    const docType = ["DNI", "CE", "Pasaporte", "RUC"].includes(b.docType) ? b.docType : "DNI";
    const description = String(b.description).slice(0, MAX_TEXTO);
    const request = String(b.request).slice(0, MAX_TEXTO);

    // Si el solicitante envió un JWT válido, lo asociamos (opcional).
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    if (authHeader) {
      const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data?.user?.id ?? null;
    }

    // 1) Persistir el reclamo (queda en el Libro de Reclamaciones).
    const { data: row, error: dbErr } = await admin
      .from("complaints")
      .insert({
        kind,
        full_name: b.fullName,
        doc_type: docType,
        doc_number: b.docNumber,
        email: b.email,
        phone: b.phone ?? null,
        address: b.address ?? null,
        good_type: goodType,
        amount: b.amount ?? null,
        description,
        request,
        user_id: userId,
      })
      .select("id, code, created_at")
      .single();

    if (dbErr) return json({ error: "No se pudo registrar: " + dbErr.message }, 500);
    const code = row?.code ?? "—";
    // La hora del registro la pone la base de datos, no el navegador ni esta
    // función: es la que va a constar como momento de presentación.
    const createdAt = row?.created_at ? new Date(row.created_at) : new Date();

    const hoja: DatosHoja = {
      code,
      kind,
      fullName: String(b.fullName),
      docType,
      docNumber: String(b.docNumber),
      email: String(b.email),
      phone: b.phone ?? null,
      address: b.address ?? null,
      goodType,
      amount: b.amount ?? null,
      description,
      request,
      createdAt,
    };

    /** Deja anotado en la propia fila cómo acabó el acuse. */
    const anotarAcuse = async (campos: Record<string, unknown>) => {
      if (!row?.id) return;
      const { error } = await admin.from("complaints").update(campos).eq("id", row.id);
      // Que no se pueda anotar no invalida el envío; solo se pierde el rastro.
      if (error) console.error("No se pudo anotar el acuse:", error.message);
    };

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY no configurada: el reclamo se guardó pero no se envió correo.");
      await anotarAcuse({
        ack_email_status: "error",
        ack_email_error: "RESEND_API_KEY no configurada",
      });
      return json({
        ok: true,
        code,
        created_at: createdAt.toISOString(),
        ack_sent: false,
        warning: "Registrado. Correo no configurado (RESEND_API_KEY).",
      });
    }

    // La copia en PDF se genera una vez y viaja en los dos correos.
    let adjuntoBase64: string | undefined;
    try {
      adjuntoBase64 = toBase64(renderHojaReclamacionPDF(hoja));
    } catch (e) {
      // Sin adjunto el correo sigue llevando la hoja completa en el cuerpo, que
      // es lo que importa; mejor eso que no enviar nada.
      console.error("No se pudo generar el PDF de la hoja:", (e as Error)?.message ?? e);
    }

    // 2) Acuse de recibo al consumidor. Va primero: es el obligatorio.
    const acuse = await enviarPorResend(
      RESEND_API_KEY,
      correoAcuseAlConsumidor(hoja, { from: FROM, replyTo: REPLY_TO, adjuntoBase64 }),
    );
    if (acuse.ok) {
      await anotarAcuse({
        ack_email_status: "enviado",
        ack_email_sent_at: new Date().toISOString(),
        ack_email_message_id: acuse.id,
        ack_email_error: null,
      });
    } else {
      console.error("Resend (acuse al consumidor):", acuse.error);
      await anotarAcuse({ ack_email_status: "error", ack_email_error: acuse.error });
    }

    // 3) Aviso interno al buzón de la empresa.
    const interno = await enviarPorResend(
      RESEND_API_KEY,
      correoAvisoInterno(hoja, { from: FROM, to: TO, adjuntoBase64 }),
    );
    if (!interno.ok) console.error("Resend (aviso interno):", interno.error);

    return json({
      ok: true,
      code,
      created_at: createdAt.toISOString(),
      ack_sent: acuse.ok,
      ...(acuse.ok
        ? {}
        : { warning: "Registrado, pero no pudimos enviarte la copia por correo." }),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
