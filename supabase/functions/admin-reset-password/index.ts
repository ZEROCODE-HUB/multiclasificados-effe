// Edge Function: admin-reset-password (REQ-ADM-03)
// El staff (admin/superadmin) genera un enlace SEGURO de restablecimiento de
// contraseña para un usuario y lo recibe de vuelta para compartírselo
// (WhatsApp, correo propio, etc.).
//
// Por qué un enlace y no el correo de Supabase: el correo por defecto usa un
// token de un solo uso que los escáneres de enlaces (Gmail, antivirus) abren y
// queman antes de que el usuario haga clic. Este enlace usa `token_hash`, que
// solo se consume cuando la app llama a verifyOtp() (JS) — los escáneres no lo
// ejecutan, así que no lo invalidan.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Dominio público de la app para armar el enlace. Configúralo como secreto:
  //   supabase secrets set PUBLIC_SITE_URL="https://multiclasificados-effe.vercel.app"
  const SITE_URL = (Deno.env.get("PUBLIC_SITE_URL") || "https://multiclasificados-effe.vercel.app").replace(/\/$/, "");

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

    // Genera el token de recuperación SIN enviar correo. Nos quedamos con el
    // hashed_token para construir el enlace directo a la app.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${SITE_URL}/reset-password` },
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: linkErr?.message || "No se pudo generar el enlace" }, 500);
    }

    const link = `${SITE_URL}/reset-password?token_hash=${linkData.properties.hashed_token}&type=recovery`;

    // Registro de auditoría (actor = solicitante). Bypassa RLS con service_role.
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "reset_password",
      entity_type: "user",
      entity_id: user_id,
      metadata: { email, method: "link" },
    });

    return json({ ok: true, email, link });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
