// Edge Function: send-reclamo (Libro de Reclamaciones)
// Recibe el reclamo desde la página principal, lo guarda en la tabla
// `public.complaints` (con service_role) y envía el correo a los destinatarios
// reclamos@coleffe.com y soporte@coleffe.com usando Resend.
//
// Secrets requeridos (Supabase → Edge Functions → Secrets):
//   - SUPABASE_URL                (lo provee Supabase)
//   - SUPABASE_SERVICE_ROLE_KEY   (lo provee Supabase)
//   - RESEND_API_KEY              (API key de https://resend.com)
//   - RECLAMOS_FROM (opcional)    remitente verificado, ej. "eFFe <reclamos@coleffe.com>".
//                                 Sin dominio verificado, dejar "onboarding@resend.dev".
//   - RECLAMOS_TO (opcional)      destinatarios separados por coma. Por defecto:
//                                 reclamos@coleffe.com,soporte@coleffe.com.
//                                 En modo PRUEBA (dominio sin verificar) ponlo a TU
//                                 propio correo de la cuenta Resend para recibir el test.
//
// Deploy:  supabase functions deploy send-reclamo --no-verify-jwt
//   (--no-verify-jwt para permitir reclamos de visitantes sin sesión)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Destinatarios del Libro de Reclamaciones. Configurables vía RECLAMOS_TO
// (coma-separados); por defecto los correos oficiales de coleffe.com.
const TO = (Deno.env.get("RECLAMOS_TO") ?? "reclamos@coleffe.com,soporte@coleffe.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const KIND_LABEL: Record<string, string> = { reclamo: "Reclamo", queja: "Queja" };
const GOOD_LABEL: Record<string, string> = { producto: "Producto", servicio: "Servicio" };

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

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
        description: b.description,
        request: b.request,
        user_id: userId,
      })
      .select("code")
      .single();

    if (dbErr) return json({ error: "No se pudo registrar: " + dbErr.message }, 500);
    const code = row?.code ?? "—";

    // 2) Enviar el correo a reclamos@ y soporte@ vía Resend.
    if (RESEND_API_KEY) {
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:640px">
          <h2 style="margin:0 0 4px">Nueva ${esc(KIND_LABEL[kind])} — Hoja N.º ${esc(code)}</h2>
          <p style="color:#6b7280;margin:0 0 16px">Libro de Reclamaciones · eFFe Multiclasificados</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            ${row2("Tipo", KIND_LABEL[kind])}
            ${row2("Nombre completo", b.fullName)}
            ${row2("Documento", `${docType} ${b.docNumber}`)}
            ${row2("Correo", b.email)}
            ${row2("Teléfono", b.phone || "—")}
            ${row2("Domicilio", b.address || "—")}
            ${row2("Tipo de bien", GOOD_LABEL[goodType])}
            ${row2("Monto reclamado", b.amount || "—")}
            ${row2("Detalle del reclamo", b.description)}
            ${row2("Pedido del consumidor", b.request)}
          </table>
        </div>`;

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: TO,
          reply_to: b.email,
          subject: `[Libro de Reclamaciones] ${KIND_LABEL[kind]} N.º ${code} — ${b.fullName}`,
          html,
        }),
      });

      if (!resp.ok) {
        const errTxt = await resp.text();
        // El reclamo ya quedó guardado; reportamos que el correo falló.
        console.error("Resend error:", resp.status, errTxt);
        return json(
          { ok: true, code, warning: "Registrado, pero el correo no pudo enviarse." },
          200,
        );
      }
    } else {
      console.warn("RESEND_API_KEY no configurada: el reclamo se guardó pero no se envió correo.");
      return json({ ok: true, code, warning: "Registrado. Correo no configurado (RESEND_API_KEY)." });
    }

    return json({ ok: true, code });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

function row2(label: string, value: unknown): string {
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:bold;width:200px;vertical-align:top">${esc(label)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;white-space:pre-wrap">${esc(value)}</td>
  </tr>`;
}
