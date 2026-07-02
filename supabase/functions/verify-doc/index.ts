// Edge Function: verify-doc
// Verifica un DNI (persona natural) o RUC (persona jurídica) contra la API de
// Factiliza (server-side; el token de Factiliza NUNCA viaja al cliente).
// Lo usa el flujo de publicación de avisos para confirmar la identidad del
// anunciante antes del pago.
//
// Request (POST JSON):
//   { "tipo": "dni" | "ruc", "numero": "12345678" }
//
// Response (200 JSON):
//   { "success": true,  "tipo": "dni", "numero": "...", "nombre": "JUAN PEREZ", "data": {...} }
//   { "success": false, "error": "No se encontró el documento." }
//
// Secret requerido (Supabase → Edge Functions → Secrets):
//   - FACTILIZA_TOKEN  (el token JWT de tu cuenta Factiliza → sección "Token")
//
// Deploy:  supabase functions deploy verify-doc --no-verify-jwt
//   (--no-verify-jwt: la verificación de identidad ocurre antes del login,
//    igual que el flujo actual de "Verificar" que no exige sesión todavía)

const FACTILIZA_TOKEN = Deno.env.get("FACTILIZA_TOKEN") ?? "";
const FACTILIZA_BASE = "https://api.factiliza.com/v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!FACTILIZA_TOKEN) {
      return json({ success: false, error: "Verificación no configurada (falta FACTILIZA_TOKEN)." });
    }

    const { tipo, numero } = await req.json().catch(() => ({}));
    const doc = String(numero ?? "").replace(/\D/g, "");

    if (tipo !== "dni" && tipo !== "ruc") {
      return json({ success: false, error: "Tipo de documento inválido." });
    }
    if (tipo === "dni" && doc.length !== 8) {
      return json({ success: false, error: "El DNI debe tener 8 dígitos." });
    }
    if (tipo === "ruc" && doc.length !== 11) {
      return json({ success: false, error: "El RUC debe tener 11 dígitos." });
    }

    const url = `${FACTILIZA_BASE}/${tipo}/info/${doc}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${FACTILIZA_TOKEN}`,
        Accept: "application/json",
      },
    });

    const payload = await res.json().catch(() => null);

    // Factiliza responde { success, status, message, data }.
    if (!res.ok || !payload?.success || !payload?.data) {
      const msg =
        payload?.message ??
        (res.status === 401
          ? "Token de Factiliza inválido o vencido."
          : "No se encontró el documento.");
      return json({ success: false, error: msg });
    }

    const data = payload.data as Record<string, unknown>;
    // DNI → nombre_completo · RUC → nombre_o_razon_social
    const nombre =
      (data.nombre_completo as string) ??
      (data.nombre_o_razon_social as string) ??
      (data.razon_social as string) ??
      "";

    return json({
      success: true,
      tipo,
      numero: doc,
      nombre,
      // Datos útiles para el comprobante (dirección/estado en RUC, etc.)
      data,
    });
  } catch (e) {
    return json({ success: false, error: String(e) });
  }
});
