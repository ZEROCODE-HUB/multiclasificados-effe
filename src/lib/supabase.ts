import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // No rompemos la app (los botones demo siguen funcionando sin backend),
  // pero avisamos en consola que falta configurar el .env.
  console.warn(
    "[supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env. " +
      "El login real / datos de Supabase no funcionarán hasta configurarlos."
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE: requerido para completar OAuth por deep link en el APK (Capacitor).
    flowType: "pkce",
  },
});
