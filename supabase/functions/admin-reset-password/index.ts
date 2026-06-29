// Edge Function: admin-reset-password (REQ-ADM-03)
// El staff (admin/superadmin) fuerza el envío de un correo de restablecimiento
// de contraseña a un usuario. Valida el rol del solicitante con su JWT y usa el
// service_role SOLO desde el entorno (Deno.env), nunca incrustado en el repo.
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

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Falta autenticación" }, 401);

    // Cliente con el JWT del solicitante para identificarlo.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Sesión inválida" }, 401);

    // Cliente service_role para verificar el rol y leer auth.users.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: isStaff } = await admin.rpc("is_staff", { _uid: user.id });
    if (!isStaff) return json({ error: "No autorizado" }, 403);

    const { user_id } = await req.json().catch(() => ({}));
    if (!user_id) return json({ error: "Falta user_id" }, 400);

    // Email del usuario objetivo.
    const { data: target, error: getErr } = await admin.auth.admin.getUserById(user_id);
    if (getErr || !target?.user?.email) return json({ error: "Usuario no encontrado" }, 404);
    const email = target.user.email;

    // Dispara el correo de recuperación (usa el mailer configurado en Supabase Auth).
    const { error: resetErr } = await admin.auth.resetPasswordForEmail(email);
    if (resetErr) return json({ error: resetErr.message }, 500);

    // Registro de auditoría (actor = solicitante). Bypassa RLS con service_role.
    await admin.from("audit_logs").insert({
      actor_id: user.id,
      action: "reset_password",
      entity_type: "user",
      entity_id: user_id,
      metadata: { email },
    });

    return json({ ok: true, email });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
