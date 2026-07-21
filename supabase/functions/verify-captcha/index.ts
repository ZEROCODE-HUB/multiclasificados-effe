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
    // EFFE-048: además de data.success, exigimos que el token sea FRESCO. hCaptcha
    // devuelve challenge_ts (cuándo se resolvió); si tiene más de 2 min lo
    // rechazamos, para no aceptar un token viejo fuera de su ventana. Solo se
    // rechaza cuando la antigüedad es un número finito y claramente grande (un
    // reloj desfasado o un challenge_ts ausente NO invalidan un login legítimo).
    const MAX_AGE_MS = 2 * 60 * 1000;
    let fresh = true;
    if (data.success && data.challenge_ts) {
      const age = Date.now() - Date.parse(data.challenge_ts);
      if (Number.isFinite(age) && age > MAX_AGE_MS) fresh = false;
    }
    return new Response(JSON.stringify({ success: !!data.success && fresh }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
