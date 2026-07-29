// Diagnóstico de arranque. Lógica PURA (sin React, sin efectos) para poder
// testearla y reutilizarla desde `supabase.ts`, `BootError` y `main.tsx`.
//
// Motivación: si el arranque falla (env faltante, cliente que no se puede crear,
// red bloqueada), la app se quedaba en el `#boot-loader` de index.html sin decir
// qué pasó. Estas utilidades permiten mostrar EN PANTALLA qué falta o qué falla.

// Variables de entorno estrictamente necesarias para que la app OPERE (login y
// datos reales). Las demás `VITE_*` (site url, izipay, hcaptcha) tienen fallback
// y son de features concretas, así que no bloquean el arranque.
export const REQUIRED_ENV = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] as const;

// Se muestran en el diagnóstico para ver de un vistazo si el build salió
// incompleto, pero su ausencia NO impide arrancar (solo rompe su función).
export const OPTIONAL_ENV = [
  "VITE_PUBLIC_SITE_URL",
  "VITE_IZIPAY_PUBLIC_KEY",
  "VITE_HCAPTCHA_SITE_KEY",
] as const;

export type EnvDiagnostics = {
  ok: boolean;
  missing: string[];
  present: string[];
};

// Fuente de env por defecto: las variables que Vite incrusta en tiempo de build.
// Se acepta un objeto por parámetro para poder testear (en Vitest
// `import.meta.env.VITE_*` es `undefined`, así que inyectamos un env de prueba).
type EnvLike = Record<string, unknown>;

const defaultEnv: EnvLike = (import.meta.env ?? {}) as EnvLike;

// ¿Qué variables requeridas están presentes (no vacías) y cuáles faltan?
export function computeEnvDiagnostics(env: EnvLike = defaultEnv): EnvDiagnostics {
  const missing: string[] = [];
  const present: string[] = [];
  for (const key of REQUIRED_ENV) {
    const raw = env[key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) present.push(key);
    else missing.push(key);
  }
  return { ok: missing.length === 0, missing, present };
}

// Limpia un valor de env: recorta espacios y QUITA un par de comillas
// envolventes. Es un error clásico al pegar valores en paneles de CI (Codemagic,
// Vercel): el valor queda como `"https://..."` con las comillas literales
// incrustadas en el build, y todo lo que dependa de él se rompe en silencio.
export function cleanEnvValue(raw: unknown): string {
  let v = typeof raw === "string" ? raw.trim() : "";
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      v = v.slice(1, -1).trim();
    }
  }
  return v;
}

// Normaliza la URL de Supabase para que sea utilizable aunque venga "sucia":
// quita comillas/espacios y antepone `https://` si falta el esquema (otro error
// típico: cargar `proyecto.supabase.co` sin el `https://`). Sin esquema,
// supabase-js la rechaza y la app no arranca.
export function normalizeSupabaseUrl(raw: unknown): string {
  let v = cleanEnvValue(raw);
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  return v.replace(/\/+$/, "");
}

// Valida la URL/clave de Supabase con las MISMAS reglas que exige
// `@supabase/supabase-js` al crear el cliente (no vacías + http/https), pero
// sobre el valor YA NORMALIZADO (comillas quitadas, esquema añadido). Devuelve un
// mensaje legible si algo está mal, o `null` si la config es válida. Lo usa
// `supabase.ts` para no lanzar en tiempo de import.
export function validateSupabaseConfig(
  url: string | undefined,
  anonKey: string | undefined,
): string | null {
  const rawU = cleanEnvValue(url);
  const k = cleanEnvValue(anonKey);
  if (!rawU) return "Falta VITE_SUPABASE_URL.";
  if (!k) return "Falta VITE_SUPABASE_ANON_KEY.";
  const u = normalizeSupabaseUrl(url);
  if (!/^https?:\/\//i.test(u)) return "VITE_SUPABASE_URL no es una URL http(s) válida.";
  if (isPlaceholderValue(u)) return "VITE_SUPABASE_URL es un valor de ejemplo, no el proyecto real.";
  // A la clave NO se le aplica el detector de valores de ejemplo: es base64 y
  // una coincidencia por azar dejaría sin arrancar un build sano. Para la clave
  // basta el formato; de su validez responde el chequeo de conexión real.
  if (!looksLikeAnonKey(k)) return "VITE_SUPABASE_ANON_KEY no tiene el formato de una clave de Supabase (¿se copió incompleta?).";
  return null;
}

// Valores de relleno que se cuelan cuando el build corre sin las variables
// reales: pasan la validación de formato pero no apuntan a ningún proyecto, así
// que la app arranca y luego NADA funciona (ni login ni avisos), que es
// justamente el fallo silencioso que hay que evitar.
const PLACEHOLDER_RE = /\b(dummy|example|ejemplo|placeholder|changeme|tu[-_]?proyecto|your[-_]?project|xxx+)\b|[<>{}]/i;

export function isPlaceholderValue(value: unknown): boolean {
  const v = cleanEnvValue(value);
  return !!v && PLACEHOLDER_RE.test(v);
}

// La clave anónima es un JWT (`eyJ…` en tres partes) o una clave publicable del
// formato nuevo (`sb_publishable_…`). Cualquier otra cosa suele ser un pegado a
// medias o la variable equivocada.
export function looksLikeAnonKey(value: unknown): boolean {
  const v = cleanEnvValue(value);
  if (!v) return false;
  if (/^sb_(publishable|secret)_[A-Za-z0-9_-]{10,}$/.test(v)) return true;
  return /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v);
}

export type ProbeResult = "ok" | "unreachable" | "skipped";

// Resultado del chequeo COMPLETO de arranque: no basta con que la URL tenga
// buena forma, hay que saber si el proyecto responde y si la clave la acepta.
export type HealthStatus =
  | "ok"
  | "offline"        // el dispositivo dice que no hay internet
  | "unreachable"    // no se pudo llegar al proyecto (DNS, URL equivocada, red bloqueada)
  | "invalid-key"    // el proyecto responde pero rechaza la clave anónima
  | "server-error";  // el proyecto respondió con un error inesperado

export interface HealthResult {
  status: HealthStatus;
  /** Código HTTP de la respuesta que decidió el resultado, si lo hubo. */
  httpStatus?: number;
  /** Mensaje del servidor o del fallo de red, para mostrarlo tal cual. */
  detail?: string;
}

/**
 * Comprueba de verdad que la app puede hablar con su backend.
 *
 * `validateSupabaseConfig` solo mira la FORMA de las variables: con una URL bien
 * escrita pero de otro proyecto, o con una clave caducada, la app arrancaba
 * perfecta y luego no dejaba iniciar sesión ni mostraba avisos, sin un solo
 * mensaje.
 *
 * Basta UNA petición a `/auth/v1/health` enviando la clave. Comprobado contra el
 * proyecto real: con la clave buena responde 200; con una clave inválida, 401 con
 * `{"message":"Invalid API key"}`; un host que no es Supabase da 404. (Ojo: NO
 * sirve sondear `/rest/v1/`, que responde 401 incluso con la clave correcta.)
 */
export async function checkSupabaseHealth(
  url: string | undefined,
  anonKey: string | undefined,
  timeoutMs = 8000,
): Promise<HealthResult> {
  const u = normalizeSupabaseUrl(url);
  const k = cleanEnvValue(anonKey);
  if (!u || !k) return { status: "unreachable", detail: "Configuración incompleta." };

  // Sin conexión no se puede culpar a la configuración: es otro problema y otro
  // mensaje (y el usuario solo tiene que recuperar la señal).
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { status: "offline" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${u}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: k },
      signal: controller.signal,
    });
  } catch (e) {
    return { status: "unreachable", detail: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 404) {
    return { status: "unreachable", httpStatus: 404, detail: "La URL no corresponde a un proyecto de Supabase." };
  }
  if (res.status === 401 || res.status === 403) {
    let detail = "El proyecto rechazó la clave anónima.";
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = body.message;
    } catch { /* cuerpo no JSON: basta con el mensaje por defecto */ }
    return { status: "invalid-key", httpStatus: res.status, detail };
  }
  if (res.status >= 500) {
    return { status: "server-error", httpStatus: res.status, detail: "El proyecto respondió con un error." };
  }
  return { status: "ok" };
}

// Auto-test de conectividad: ¿el dispositivo alcanza el backend de Supabase?
// Sirve para distinguir "config mala" de "red/CSP/DNS bloqueados". Cualquier
// respuesta (incluso 4xx) cuenta como alcanzable; un rechazo o timeout = no.
export async function probeSupabase(
  url: string | undefined,
  timeoutMs = 5000,
): Promise<ProbeResult> {
  const u = (url ?? "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return "skipped";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // `/auth/v1/health` responde 200 en proyectos Supabase; da igual el cuerpo,
    // solo nos importa que la petición llegue y vuelva.
    await fetch(`${u.replace(/\/+$/, "")}/auth/v1/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return "ok";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}
