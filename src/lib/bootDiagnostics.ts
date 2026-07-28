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
  return null;
}

export type ProbeResult = "ok" | "unreachable" | "skipped";

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
