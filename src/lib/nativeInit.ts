// Ajustes específicos cuando la app corre como APK/IPA (Capacitor).
// En web no hace nada (los plugins nativos no están disponibles).
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { initPush } from "@/lib/push";
import { supabase } from "@/lib/supabase";

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  // Registra notificaciones push (FCM) en el dispositivo.
  initPush();

  // OAuth (Google/Facebook): al volver del navegador por deep link, completa
  // la sesión con el código (PKCE) y regresa a la app.
  try {
    const { App } = await import("@capacitor/app");
    App.addListener("appUrlOpen", async ({ url }) => {
      if (!url || !url.includes("auth-callback")) return;
      const code = url.match(/[?&]code=([^&]+)/)?.[1] ?? null;
      try {
        if (code) await supabase.auth.exchangeCodeForSession(decodeURIComponent(code));
      } catch (e) {
        console.warn("[oauth] no se pudo completar la sesión", e);
      }
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
      } catch { /* navegador ya cerrado */ }
      // Vuelve a la app; el SupabaseAuthBridge ya tendrá la sesión.
      window.location.href = "/";
    });
  } catch { /* @capacitor/app no disponible */ }
  try {
    // Evita que la vista web se dibuje DEBAJO de la barra de estado:
    // así el contenido empieza justo bajo la barra y la respeta.
    await StatusBar.setOverlaysWebView({ overlay: false });
    // Barra clara (íconos oscuros) acorde al navbar blanco del sistema.
    await StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#ffffff" });
    }
  } catch {
    /* sin barra de estado nativa disponible */
  }
}
