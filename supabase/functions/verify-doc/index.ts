// Edge Function: verify-doc
// Verifica un DNI (persona natural) o RUC (persona jurídica) contra la API de
// Factiliza (server-side; el token de Factiliza NUNCA viaja al cliente).
// Lo usa el flujo de publicación de avisos para confirmar la identidad del
// anunciante antes del pago.
//
// Request (POST JSON):
//   { "tipo": "dni" | "ruc", "numero": "12345678" }
//   Header obligatorio: Authorization: Bearer <access_token del USUARIO>
//
// Response (200 JSON):
//   { "success": true,  "tipo": "dni", "numero": "...", "nombre": "JUAN PEREZ", "data": {...} }
//   { "success": false, "error": "No se encontró el documento." }
// Response 401: { "success": false, "error": "Inicia sesión para verificar tu documento." }
//
// IMPORTANTE (seguridad): esta función consulta datos personales (RENIEC:
// nombre y domicilio) y cada llamada consume saldo de Factiliza. Por eso EXIGE
// una sesión de usuario real. No basta la anon key: es pública (va en el bundle
// del navegador y del APK), así que la rechazamos explícitamente — de lo
// contrario cualquiera podría iterar DNIs y usar esto como buscador de
// domicilios a costa de nuestra cuenta.
//
// Secret requerido (Supabase → Edge Functions → Secrets):
//   - FACTILIZA_TOKEN  (el token JWT de tu cuenta Factiliza → sección "Token")
//
// Deploy:  supabase functions deploy verify-doc
//   (SIN --no-verify-jwt: el gateway filtra las peticiones sin JWT y el código
//    de abajo, además, descarta la anon key y exige un usuario autenticado)

const FACTILIZA_TOKEN = Deno.env.get("FACTILIZA_TOKEN") ?? "";
const FACTILIZA_BASE = "https://api.factiliza.com/v1";

// Inyectadas automáticamente por Supabase en el entorno de la Edge Function.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Devuelve el id del usuario dueño del token, o null si no hay usuario real.
async function authenticatedUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  // La anon key es un JWT válido para el gateway, pero NO identifica a nadie.
  if (token === SUPABASE_ANON_KEY) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;

  const user = await res.json().catch(() => null);
  return typeof user?.id === "string" ? user.id : null;
}

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

    // Solo usuarios autenticados: se comprueba ANTES de gastar una consulta.
    if (!(await authenticatedUserId(req))) {
      return json({ success: false, error: "Inicia sesión para verificar tu documento." }, 401);
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
    // Cuando el documento no existe, Factiliza devuelve un mensaje genérico
    // ("Problemas con el servicio de consulta de DNI, por favor comuníquese con
    // el Proveedor") que confunde al usuario. Lo unificamos a un mensaje claro.
    // Solo el 401 (token inválido/vencido) se mantiene aparte: es un problema de
    // configuración nuestro, no del documento que ingresó el usuario.
    if (!res.ok || !payload?.success || !payload?.data) {
      const msg =
        res.status === 401
          ? "Token de Factiliza inválido o vencido."
          : "No se encontró el USUARIO/EMPRESA con el DNI/RUC ingresado";
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
    // EFFE-053: no exponer el error técnico crudo (timeout, red, etc.) al usuario;
    // se registra para depurar y se muestra un mensaje amigable.
    console.error("[verify-doc] error:", e);
    return json({ success: false, error: "No se pudo verificar el documento en este momento. Inténtalo de nuevo en unos minutos." });
  }
});
