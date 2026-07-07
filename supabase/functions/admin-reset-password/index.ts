// Edge Function: admin-reset-password (REQ-ADM-03)
// El staff (admin/superadmin) dispara el restablecimiento de contraseña de un
// usuario: Supabase ENVÍA el correo de recuperación (servicio integrado, sin
// depender de proveedores externos). Si el envío falla (p.ej. se supera el
// límite del correo integrado), se devuelve un enlace seguro (token_hash) como
// respaldo para compartirlo a mano.
//
// El correo integrado de Supabase (tier gratis) tiene un límite de ~2/hora y no
// permite personalizar la plantilla. La pantalla /reset-password ya maneja tanto
// el enlace por defecto como el token_hash del respaldo.
//
// Deploy:  supabase functions deploy admin-reset-password  (o vía Management API)
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

    // Envía el correo de recuperación con el servicio integrado de Supabase.
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { error: sendErr } = await anon.auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE_URL}/reset-password`,
    });

    let emailed = false;
    let link: string | null = null;
    let emailError: string | null = null;

    if (!sendErr) {
      emailed = true;
    } else {
      emailError = sendErr.message;
      // Respaldo: enlace copiable (token_hash) por si el correo no salió
      // (p.ej. se superó el límite del correo integrado).
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${SITE_URL}/reset-password` },
      });
      if (linkData?.properties?.hashed_token) {
        link = `${SITE_URL}/reset-password?token_hash=${linkData.properties.hashed_token}&type=recovery`;
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

    return json({ ok: true, email, emailed, link, emailError });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
