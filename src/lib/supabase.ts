import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { validateSupabaseConfig, normalizeSupabaseUrl, cleanEnvValue } from "@/lib/bootDiagnostics";

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Normalizamos los valores del build antes de usarlos: quitamos comillas
// envolventes y añadimos `https://` si falta (errores clásicos al pegar en
// Codemagic/Vercel). Así el cliente recibe una URL/clave limpias.
export const supabaseUrl = normalizeSupabaseUrl(rawUrl);
const anonKey = cleanEnvValue(rawAnonKey);

// Si la config falta o es inválida, `createClient` de supabase-js 2.x LANZA en
// tiempo de import ("supabaseUrl is required."), lo que abortaría todo el bundle
// antes de montar React y dejaría el splash pegado sin decir nada. En vez de eso
// exponemos el error y creamos el cliente con un placeholder VÁLIDO para no
// romper el import: `main.tsx` lee este flag y muestra una pantalla de
// diagnóstico legible (ver BootError / bootDiagnostics).
export const supabaseConfigError: string | null = validateSupabaseConfig(rawUrl, rawAnonKey);

if (supabaseConfigError) {
  console.warn(`[supabase] ${supabaseConfigError} El login/datos reales no funcionarán.`);
}

export const supabase = createClient(
  supabaseConfigError ? "https://sin-configurar.invalid" : supabaseUrl,
  supabaseConfigError ? "anon-key-placeholder" : anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // PKCE solo en el APK (Capacitor): requerido para completar OAuth por deep
      // link. En web usamos el flujo implícito para que los enlaces de recuperación
      // de contraseña funcionen aunque el usuario los abra en otro navegador
      // (PKCE ataría el enlace al navegador que lo generó y rompería ese caso).
      flowType: Capacitor.isNativePlatform() ? "pkce" : "implicit",
    },
  },
);
