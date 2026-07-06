// Edge Function: send-push
// Se dispara con un Database Webhook de Supabase en INSERT sobre `notifications`.
// Busca los tokens de dispositivo del usuario y envía una notificación push
// vía Firebase Cloud Messaging (FCM HTTP v1).
//
// Secrets requeridos (Supabase → Edge Functions → Secrets):
//   - SUPABASE_URL                (lo provee Supabase)
//   - SUPABASE_SERVICE_ROLE_KEY   (lo provee Supabase)
//   - FCM_SERVICE_ACCOUNT         (JSON completo de la cuenta de servicio de Firebase)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SA = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") || "{}");

// Texto legible según el tipo de evento (igual que en el frontend).
function bodyFor(type: string, payload: Record<string, unknown>): string {
  const p = payload || {};
  switch (type) {
    case "admin_message":
      return p.body ? `${p.body}` : "Tienes un nuevo mensaje del equipo";
    case "new_message":
      return p.preview ? `${p.preview}` : "Tienes un nuevo mensaje";
    case "saved_search_match":
      return `${p.count ?? ""} nuevos avisos para "${p.name ?? "tu búsqueda"}"`;
    case "application_status":
      return `Tu postulación cambió de estado`;
    case "new_review":
      return `Recibiste una nueva reseña`;
    default:
      return "Tienes una nueva notificación";
  }
}

// --- OAuth2: obtiene un access token a partir de la cuenta de servicio ---
function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: FCM_SA.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;

  // Importa la clave privada (PKCS8) y firma con RS256.
  const pem = (FCM_SA.private_key as string)
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned))
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("OAuth FCM falló: " + JSON.stringify(json));
  return json.access_token;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    // Acepta el formato de Database Webhook { type, record } o { record }.
    const record = payload.record ?? payload;
    if (!record?.user_id) return new Response("sin user_id", { status: 200 });
    // Solo empujamos las notificaciones in-app (las que siempre se crean).
    if (record.channel && record.channel !== "in_app") {
      return new Response("canal ignorado", { status: 200 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: tokens } = await admin
      .from("device_tokens")
      .select("token")
      .eq("user_id", record.user_id);

    if (!tokens?.length) return new Response("sin dispositivos", { status: 200 });

    const accessToken = await getAccessToken();
    const title = record.title || "eFFe Clasificados";
    const body = bodyFor(record.type, record.payload || {});

    let sent = 0;
    for (const { token } of tokens) {
      const r = await fetch(
        `https://fcm.googleapis.com/v1/projects/${FCM_SA.project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: { type: String(record.type ?? ""), payload: JSON.stringify(record.payload ?? {}) },
              android: { priority: "HIGH" },
            },
          }),
        }
      );
      if (r.ok) sent++;
      else {
        const err = await r.text();
        // Token inválido/expirado → lo limpiamos.
        if (r.status === 404 || r.status === 400) {
          await admin.from("device_tokens").delete().eq("token", token);
        }
        console.warn("FCM error", r.status, err);
      }
    }
    return new Response(JSON.stringify({ sent }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
