// Notificaciones push nativas (FCM en Android). Solo corre en el APK/IPA.
// Obtiene el token del dispositivo y lo guarda en `device_tokens` para que
// la Edge Function `send-push` pueda enviar notificaciones al teléfono.
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

let lastToken: string | null = null;

// Abre la pantalla que indique el push. La Edge Function manda la ruta en
// `data.route` (p. ej. "/dashboard/buscador/mensajes"); sin ella, la app se
// queda donde esté. Se navega con location.href —igual que el retorno del
// OAuth en nativeInit.ts— porque esto corre fuera del árbol de React y no hay
// acceso al router.
function openRoute(data: unknown) {
  const route = (data as Record<string, unknown> | undefined)?.route;
  // Solo rutas internas: un payload con URL absoluta no debe poder sacar al
  // usuario de la app.
  if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) return;
  window.location.href = route;
}

// Registra los listeners. NO pide permisos: eso lo hace requestPushPermission()
// después del login. Preguntar en el arranque en frío, sin que el usuario haya
// hecho nada todavía, se traduce en que casi todos dicen que no — y en iOS el
// rechazo es definitivo (no se vuelve a preguntar).
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

    // Al TOCAR la notificación: llevar a la pantalla que corresponda. Sin esto
    // la app abría siempre en el inicio y el usuario tenía que buscar a mano el
    // chat o el aviso del que le acababan de avisar.
    PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      openRoute(notification.data);
    });

    // Si el permiso ya estaba concedido de una sesión anterior, se re-registra
    // en silencio para refrescar el token del dispositivo.
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") await PushNotifications.register();
  } catch (e) {
    console.warn("[push] no disponible", e);
  }
}

// Pide el permiso de notificaciones. Se llama tras iniciar sesión, que es
// cuando la app ya tiene algo que notificar (mensajes, postulaciones) y la
// petición tiene sentido para el usuario.
export async function requestPushPermission() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    // Ya concedido: basta con re-registrar. Ya denegado: no insistir (en iOS el
    // sistema ni siquiera muestra el diálogo otra vez).
    if (perm.receive === "granted") { await PushNotifications.register(); return; }
    if (perm.receive === "denied") return;

    const asked = await PushNotifications.requestPermissions();
    if (asked.receive === "granted") await PushNotifications.register();
  } catch (e) {
    console.warn("[push] no se pudo pedir el permiso", e);
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
