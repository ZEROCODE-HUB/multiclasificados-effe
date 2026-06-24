// Ajustes específicos cuando la app corre como APK/IPA (Capacitor).
// En web no hace nada (los plugins nativos no están disponibles).
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { initPush } from "@/lib/push";

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;
  // Registra notificaciones push (FCM) en el dispositivo.
  initPush();
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
