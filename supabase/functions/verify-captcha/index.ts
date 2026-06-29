// Edge Function: verify-captcha
// Verifica un token de hCaptcha contra la API de hCaptcha (server-side, el
// secreto nunca va al cliente). Lo usa la puerta de 2FA del staff.
//
// Secret requerido (Supabase → Edge Functions → Secrets):
//   - HCAPTCHA_SECRET  (secreto de hCaptcha; en dev: 0x0000000000000000000000000000000000000000)

const HCAPTCHA_SECRET = Deno.env.get("HCAPTCHA_SECRET") ?? "0x0000000000000000000000000000000000000000";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "sin token" }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const body = new URLSearchParams({ secret: HCAPTCHA_SECRET, response: token });
    const res = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    return new Response(JSON.stringify({ success: !!data.success }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
