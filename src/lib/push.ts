// Notificaciones push nativas (FCM en Android). Solo corre en el APK/IPA.
// Obtiene el token del dispositivo y lo guarda en `device_tokens` para que
// la Edge Function `send-push` pueda enviar notificaciones al teléfono.
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

let lastToken: string | null = null;

// Inicializa los listeners y pide permiso de notificaciones (solo nativo).
export async function initPush() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");

    // Token de registro → lo guardamos.
    PushNotifications.addListener("registration", (t) => {
      lastToken = t.value;
      savePushToken();
    });
    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[push] error de registro", err);
    });
    // Cuando llega un push con la app abierta: la campanita ya se actualiza
    // por Realtime, así que no hace falta nada extra aquí.

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === "granted") {
      await PushNotifications.register();
    }
  } catch (e) {
    console.warn("[push] no disponible", e);
  }
}

// Guarda el token del dispositivo asociándolo al usuario actual.
// Se llama tras obtener el token y también tras iniciar sesión.
export async function savePushToken() {
  if (!Capacitor.isNativePlatform() || !lastToken) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // sin sesión todavía; se guardará tras el login
    await supabase.rpc("register_device_token", {
      p_token: lastToken,
      p_platform: Capacitor.getPlatform(),
    });
  } catch (e) {
    console.warn("[push] no se pudo guardar el token", e);
  }
}
