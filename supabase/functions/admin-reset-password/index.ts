// Edge Function: admin-reset-password (REQ-ADM-03)
// El staff (admin/superadmin) dispara el restablecimiento de contraseña de un
// usuario: se genera un enlace SEGURO (token_hash) y se ENVÍA POR CORREO al
// usuario vía Resend. También se devuelve el enlace para compartirlo a mano si
// hiciera falta.
//
// Por qué un enlace token_hash y no el correo por defecto de Supabase: el correo
// por defecto usa un token de un solo uso que los escáneres de enlaces (Gmail,
// antivirus) abren y queman antes de que el usuario haga clic. Este enlace usa
// `token_hash`, que solo se consume cuando la app llama a verifyOtp() (JS) — los
// escáneres no lo ejecutan, así que no lo invalidan.
//
// Secrets:
//   - RESEND_API_KEY   (API key de https://resend.com) — necesario para enviar.
//   - RESET_FROM / EMAIL_FROM  (remitente verificado, p.ej. "eFFe <no-reply@tudominio.com>").
//         Sin dominio verificado, Resend solo entrega al correo dueño de la cuenta.
//   - PUBLIC_SITE_URL  (dominio público de la app).
//
// Deploy:  supabase functions deploy admin-reset-password
// Invoca:  supabase.functions.invoke("admin-reset-password", { body: { user_id } })

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

function resetEmailHtml(link: string, siteUrl: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
      <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a">Restablece tu contraseña</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta en
        <strong>eFFe Multiclasificados</strong>. Haz clic en el botón para crear una nueva contraseña.
      </p>
      <p style="text-align:center;margin:0 0 24px">
        <a href="${link}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px">
          Restablecer contraseña
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#64748b">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
      <p style="margin:0 0 20px;font-size:12px;word-break:break-all"><a href="${link}" style="color:#ea580c">${link}</a></p>
      <p style="margin:0;font-size:12px;color:#94a3b8">Si no solicitaste este cambio, puedes ignorar este correo.</p>
    </div>
    <p style="text-align:center;margin:16px 0 0;font-size:11px;color:#94a3b8">
      <a href="${siteUrl}" style="color:#94a3b8">eFFe Multiclasificados</a>
    </p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://multiclasificados-effe.vercel.app").replace(/\/$/, "");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
  const FROM = Deno.env.get("RESET_FROM") || Deno.env.get("EMAIL_FROM") || "eFFe Clasificados <onboarding@resend.dev>";

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Falta autenticación" }, 401);

    // Cliente con el JWT del solicitante para identificarlo.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Sesión inválida" }, 401);

    // Cliente service_role para verificar el rol y usar la Admin API.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaff } = await admin.rpc("is_staff", { _uid: user.id });
    if (!isStaff) return json({ error: "No autorizado" }, 403);

    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id) return json({ error: "Falta user_id" }, 400);

    // Email del usuario objetivo.
    const { data: target, error: getErr } = await admin.auth.admin.getUserById(user_id);
    if (getErr || !target?.user?.email) return json({ error: "Usuario no encontrado" }, 404);
    const email = target.user.email;

    // Genera el token de recuperación SIN enviar el correo por defecto de
    // Supabase. Nos quedamos con el hashed_token para construir el enlace directo.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${SITE_URL}/reset-password` },
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: linkErr?.message || "No se pudo generar el enlace" }, 500);
    }

    const link = `${SITE_URL}/reset-password?token_hash=${linkData.properties.hashed_token}&type=recovery`;

    // Enviar el enlace por correo al usuario vía Resend.
    let emailed = false;
    let emailError: string | null = null;
    if (!RESEND_API_KEY) {
      emailError = "RESEND_API_KEY no configurado";
    } else {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM,
            to: [email],
            subject: "Restablece tu contraseña — eFFe Multiclasificados",
            html: resetEmailHtml(link, SITE_URL),
          }),
        });
        if (resp.ok) {
          emailed = true;
        } else {
          emailError = `Resend ${resp.status}: ${(await resp.text()).slice(0, 300)}`;
        }
      } catch (e) {
        emailError = String((e as Error)?.message ?? e);
      }
    }

    // Registro de auditoría (actor = solicitante). Bypassa RLS con service_role.
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "reset_password",
      entity_type: "user",
      entity_id: user_id,
      metadata: { email, method: emailed ? "email" : "link" },
    });

    return json({ ok: true, email, link, emailed, emailError });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
