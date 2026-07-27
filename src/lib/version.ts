// Versión de la app WEB (la que corre en Vercel). Es la que se muestra en
// Ajustes y en el pie del panel de administración.
//
// ⚠️ CHECKLIST DE DESPLIEGUE: SUBE ESTE NÚMERO Y LA FECHA EN CADA DEPLOY.
// El número identifica la build en producción; la fecha ayuda a saber de cuándo
// es sin tener que mirar el commit. El APK/IPA tiene su propia versión aparte en
// android/app/build.gradle (versionName/versionCode) y su chequeo OTA.
export const APP_VERSION = "3.6";
export const APP_VERSION_DATE = "2026-07-27"; // ISO (YYYY-MM-DD); se muestra formateada

// Fecha del release en formato corto es-PE ("25 jul 2026"). Se construye con
// partes locales para evitar el desfase de un día al parsear el ISO como UTC.
export function appVersionDateLabel(): string {
  const [y, m, d] = APP_VERSION_DATE.split("-").map(Number);
  if (!y || !m || !d) return APP_VERSION_DATE;
  return new Date(y, m - 1, d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Etiqueta lista para mostrar: "v2.8 · 25 jul 2026".
export function appVersionLabel(): string {
  return `v${APP_VERSION} · ${appVersionDateLabel()}`;
}
