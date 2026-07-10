// OTA (Over-The-Air) con Capgo — actualiza el bundle WEB de la app sin pasar por
// la tienda. Complementa al modal de actualización (UpdateGate): el modal exige
// un APK nuevo cuando cambian cosas nativas; el OTA sirve para cambios solo de
// JS/CSS/HTML.
//
// IMPORTANTE — estado actual:
//   • El OTA está CABLEADO pero DESACTIVADO por defecto: la BD trae `app_ota_url`
//     y `app_ota_version` vacíos, así que initOta() no aplica nada.
//   • Para ACTIVARLO se necesita: (1) publicar un .zip del bundle web en algún
//     hosting (o usar el canal de Capgo Cloud con tu API key), y (2) fijar en
//     "Variables del sistema" las claves app_ota_url y app_ota_version.
//   • notifyAppReady() SIEMPRE se llama: sin él, si algún día se activa el
//     auto-update de Capgo, el plugin revierte el bundle por "arranque fallido".
//
// Nunca lanza: cualquier fallo se registra y la app sigue con el bundle actual.
import { Capacitor } from "@capacitor/core";
import { fetchAppVersionInfo } from "@/lib/appVersion";

export async function initOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  let updater: typeof import("@capgo/capacitor-updater").CapacitorUpdater | undefined;
  try {
    ({ CapacitorUpdater: updater } = await import("@capgo/capacitor-updater"));
  } catch {
    return; // plugin no disponible (p.ej. build sin sincronizar): no-op.
  }

  // Marca el arranque como correcto para que Capgo no revierta el bundle.
  try {
    await updater.notifyAppReady();
  } catch { /* sin auto-update configurado: no pasa nada */ }

  // OTA self-hosted opcional: la BD dice qué bundle y versión aplicar.
  try {
    const info = await fetchAppVersionInfo();
    if (!info?.ota_url || !info?.ota_version) return; // OTA desactivado.

    const current = await updater.current();
    if (current?.bundle?.version === info.ota_version) return; // ya aplicado.

    const bundle = await updater.download({ url: info.ota_url, version: info.ota_version });
    await updater.set(bundle); // recarga la WebView con el bundle nuevo.
  } catch (e) {
    console.warn("[ota] no se aplicó la actualización OTA", e);
  }
}
