// Edge Function: send-push
// La dispara un trigger de la base en INSERT sobre `notifications`. Busca los
// tokens del usuario y manda la notificación a su teléfono.
//
// DOS CAMINOS, y no es un capricho
// --------------------------------
// Android va por Firebase (FCM HTTP v1). iPhone va DIRECTO a Apple (APNs),
// porque `@capacitor/push-notifications` entrega en iOS un token de APNs y el
// campo `token` de FCM solo acepta tokens de FCM: mandarle uno de Apple es un
// rechazo seguro. El porqué de elegir esta vía y no meter el SDK de Firebase en
// iOS está explicado en `_shared/apns.ts`.
//
// Por eso aquí se consulta `platform` además del token. Si un día se registra
// una plataforma nueva, cae en la rama de FCM, que es la que sirve para todo lo
// que no sea Apple.
//
// Secrets requeridos (Supabase → Edge Functions → Secrets):
//   - SUPABASE_URL                (lo provee Supabase)
//   - SUPABASE_SERVICE_ROLE_KEY   (lo provee Supabase)
//   - FCM_SERVICE_ACCOUNT         (JSON de la cuenta de servicio de Firebase; Android)
//   - APNS_KEY_P8                 (contenido del .p8 de Apple; iOS)
//   - APNS_KEY_ID                 (10 caracteres, de developer.apple.com → Keys)
//   - APNS_TEAM_ID                (10 caracteres, de la cuenta de Apple Developer)
//   - APNS_BUNDLE_ID              (opcional; por defecto com.effe.multiclasificados)
//   - APNS_ENV                    (opcional; 'production' por defecto, 'sandbox' solo
//                                  para builds instaladas desde Xcode)
//
// Mientras los secretos de APNs no estén puestos, los iPhone se saltan sin
// ruido y Android sigue funcionando igual.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cuerpoDeNotificacion, rutaDeNotificacion } from "../_shared/textoDeNotificacion.ts";
import {
  apnsConfigurado, crearProveedorDeJwt, urlDeApns, cabecerasDeApns,
  cuerpoDeApns, interpretarApns, type ConfigApns,
} from "../_shared/apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SA = JSON.parse(Deno.env.get("FCM_SERVICE_ACCOUNT") || "{}");

const APNS: Partial<ConfigApns> = {
  claveP8: Deno.env.get("APNS_KEY_P8") ?? "",
  keyId: Deno.env.get("APNS_KEY_ID") ?? "",
  teamId: Deno.env.get("APNS_TEAM_ID") ?? "",
  bundleId: Deno.env.get("APNS_BUNDLE_ID") ?? "com.effe.multiclasificados",
  entorno: (Deno.env.get("APNS_ENV") ?? "production") === "sandbox" ? "sandbox" : "production",
};

// El proveedor cachea el JWT: Apple rechaza que se regenere más de una vez cada
// 20 minutos, y una tanda de avisos puede tocar muchos dispositivos seguidos.
const jwtDeApns = apnsConfigurado(APNS) ? crearProveedorDeJwt(APNS) : null;

/**
 * Texto y destino del push. Los dos salen de `_shared/textoDeNotificacion.ts`,
 * el mismo módulo del correo y copia exacta del de la campana.
 *
 * ERA EL CANAL PEOR TRATADO DE LOS TRES. Conocía cinco tipos; los otros diez
 * llegaban al teléfono como "Tienes una nueva notificación", que no dice nada y
 * enseña al usuario a descartarlas sin leer. Entre esos diez estaba el aviso de
 * vencimiento, que es el único que le puede costar dinero al anunciante.
 *
 * Y el destino era todavía peor: por defecto abría `/aviso/{id}`, la ficha
 * PÚBLICA. Esa ficha sale de `listing_cards`, que solo trae los avisos activos.
 * O sea que el push de "tu aviso está por vencer", en cuanto el aviso vencía,
 * llevaba a una pantalla de "este aviso ya no está disponible". El correo lo
 * había corregido por su cuenta hace tiempo; aquí nadie se enteró.
 */
function bodyFor(type: string, payload: Record<string, unknown>, titulo?: string | null): string {
  return cuerpoDeNotificacion(type, payload || {}, titulo);
}

/**
 * Ruta interna a la que lleva el toque. La app la lee en `data.route`
 * (push.ts) y navega ahí; sin ella se abría siempre el inicio y el usuario
 * tenía que buscar a mano el chat o el aviso del que le acababan de hablar.
 *
 * `roles` decide la rama del panel: el chat y el personal viven en rutas
 * distintas según quién reciba el aviso.
 */
function routeFor(record: Record<string, unknown>, roles: string[]): string | null {
  const rol = roles.includes("superadmin") ? "superadmin"
    : roles.includes("admin") ? "admin"
    : roles.includes("anunciante") ? "anunciante"
    : "buscador";
  return rutaDeNotificacion(String(record.type ?? ""), (record.payload ?? {}) as Record<string, unknown>, rol) || null;
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
      .select("token, platform")
      .eq("user_id", record.user_id);

    if (!tokens?.length) return new Response("sin dispositivos", { status: 200 });

    // El token de Google solo se pide si hay algún Android al que mandar: si
    // todos los dispositivos del usuario son iPhone, pedirlo sería una llamada
    // de red para nada, y encima una que puede fallar y tumbar el envío entero.
    const hayAndroid = tokens.some((t) => t.platform !== "ios");
    const accessToken = hayAndroid ? await getAccessToken() : "";
    const title = record.title || "eFFe Clasificados";
    const body = bodyFor(record.type, record.payload || {}, record.title);
    // Los roles hacen falta en más sitios que en el chat: un reclamo o una
    // postulación de trabajo van a la rama del panel de quien los recibe
    // (/dashboard/admin o /dashboard/superadmin), y un admin que entra por la
    // rama que no es se queda fuera. Antes solo se pedían para `new_message` y
    // esos dos avisos acababan sin destino.
    let roles: string[] = [];
    if (["new_message", "complaint_new", "career_new"].includes(String(record.type))) {
      const { data } = await admin.from("user_roles").select("role").eq("user_id", record.user_id);
      roles = (data ?? []).map((r: { role: string }) => r.role);
    }
    const route = routeFor(record, roles);

    let sent = 0;
    let omitidos = 0;
    for (const { token, platform } of tokens) {
      // ── iPhone: directo a Apple ──
      if (platform === "ios") {
        if (!jwtDeApns) {
          // Sin los secretos de APNs no se puede. No es un error del envío: es
          // que todavía no se ha configurado, y se cuenta aparte para que se
          // note en la respuesta en vez de parecer que el push "se perdió".
          omitidos++;
          continue;
        }
        const config = APNS as ConfigApns;
        const res = await fetch(urlDeApns(config, token), {
          method: "POST",
          headers: cabecerasDeApns(config, await jwtDeApns.obtener()),
          body: cuerpoDeApns({
            titulo: title, cuerpo: body,
            tipo: String(record.type ?? ""), payload: record.payload ?? {}, route,
          }),
        });
        const resultado = interpretarApns(res.status, await res.text());
        if (resultado.entregado) sent++;
        else {
          if (resultado.borrarToken) {
            await admin.from("device_tokens").delete().eq("token", token);
          }
          console.warn("APNs", res.status, resultado.motivo);
        }
        continue;
      }

      // ── Android (y cualquier otra cosa): por Firebase ──
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
              data: {
                type: String(record.type ?? ""),
                payload: JSON.stringify(record.payload ?? {}),
                // La app navega aquí al tocar la notificación (push.ts).
                ...(route ? { route } : {}),
              },
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
    return new Response(JSON.stringify(omitidos ? { sent, ios_sin_configurar: omitidos } : { sent }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
