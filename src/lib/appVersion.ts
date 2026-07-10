import { Capacitor } from "@capacitor/core";
import { supabase } from "@/lib/supabase";

// Información de versión publicada, tal como la expone `get_app_version_info()`.
export interface AppVersionInfo {
  latest_build: number;
  min_build: number;
  version_name: string;
  download_url: string;
  notes: string;
  /** OTA (Capgo): versión + URL del bundle web. Vacío = OTA desactivado. */
  ota_version: string;
  ota_url: string;
}

export type UpdateStatus = "up-to-date" | "optional" | "forced";

export interface UpdateDecision {
  status: UpdateStatus;
  installedBuild: number;
  info: AppVersionInfo;
}

/** Lee la versión publicada desde la BD. Devuelve null ante cualquier fallo. */
export async function fetchAppVersionInfo(): Promise<AppVersionInfo | null> {
  try {
    const { data, error } = await supabase.rpc("get_app_version_info");
    if (error) throw error;
    const d = (data ?? {}) as Partial<AppVersionInfo>;
    return {
      latest_build: Number(d.latest_build ?? 0),
      min_build: Number(d.min_build ?? 0),
      version_name: String(d.version_name ?? ""),
      download_url: String(d.download_url ?? ""),
      notes: String(d.notes ?? ""),
      ota_version: String(d.ota_version ?? ""),
      ota_url: String(d.ota_url ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * versionCode instalado del APK/IPA (App.getInfo().build). En web —o si el
 * plugin no responde— devuelve null: la comprobación de versión es solo nativa.
 */
export async function getInstalledBuild(): Promise<number | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const build = parseInt(info.build, 10);
    return Number.isFinite(build) ? build : null;
  } catch {
    return null;
  }
}

/**
 * Decide si hay que actualizar comparando el build instalado con lo publicado.
 * Pura y sin efectos: fácil de testear.
 *   - build < min_build     -> "forced"    (modal bloqueante)
 *   - build < latest_build  -> "optional"  (modal cerrable)
 *   - en otro caso          -> "up-to-date"
 */
export function evaluateUpdate(installedBuild: number, info: AppVersionInfo): UpdateStatus {
  if (info.min_build > 0 && installedBuild < info.min_build) return "forced";
  if (info.latest_build > 0 && installedBuild < info.latest_build) return "optional";
  return "up-to-date";
}

/**
 * Comprobación completa (solo nativo): lee build instalado + versión publicada
 * y devuelve la decisión. Null si no aplica (web) o no se pudo comprobar.
 */
export async function checkForUpdate(): Promise<UpdateDecision | null> {
  const installedBuild = await getInstalledBuild();
  if (installedBuild == null) return null;
  const info = await fetchAppVersionInfo();
  if (!info) return null;
  return { status: evaluateUpdate(installedBuild, info), installedBuild, info };
}
