import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { syncSession, AccountBlockedError } from "@/lib/auth";
import { clearSession, getSession } from "@/hooks/useSession";
import { savePushToken } from "@/lib/push";

// Sincroniza y, si la cuenta está bloqueada, avisa (syncSession ya cerró sesión).
function safeSync() {
  syncSession().catch((e) => {
    if (e instanceof AccountBlockedError) toast.error(e.message);
  });
}

// Puente Supabase → sesión local. Mantiene useSession() sincronizado con el
// estado real de autenticación sin tocar el resto de la app.
// No interfiere con las sesiones "demo" (las que no tienen flag `supabase`).
export function SupabaseAuthBridge() {
  useEffect(() => {
    // Sincroniza al cargar (por si ya hay sesión persistida).
    safeSync();

    // Asegura que Realtime use el JWT del usuario desde el arranque
    // (clave para que la autorización RLS de Realtime funcione en producción).
    supabase.auth.getSession().then(({ data }) => {
      supabase.realtime.setAuth(data.session?.access_token ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Mantiene el token de Realtime sincronizado en login, logout y
      // refresco automático de token (TOKEN_REFRESHED cada ~1h).
      supabase.realtime.setAuth(session?.access_token ?? null);

      if (session?.user) {
        safeSync();
        // Asocia el token de push del dispositivo a este usuario (en el APK).
        savePushToken();
      } else {
        // Solo limpiamos si la sesión local provenía de Supabase (no la demo).
        const current = getSession();
        if (current?.supabase) clearSession();
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
