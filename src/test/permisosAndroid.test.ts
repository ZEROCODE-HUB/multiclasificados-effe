// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Los permisos que el APK necesita para que sus funciones existan.
 *
 * Un permiso que falta en Android no da error de compilación, no rompe el
 * arranque y no aparece en ningún log: la función simplemente no ocurre. El
 * flujo de release sale en verde, el AAB se sube a Play y el fallo lo descubre
 * un usuario que pulsa un botón y no pasa nada.
 *
 * Pasó de verdad. El AAB del 26-ago-2026 —descargado del propio Actions y
 * abierto— llevaba `POST_NOTIFICATIONS` (lo aporta Firebase al fusionar
 * manifests) pero **ningún permiso de ubicación**, mientras el buscador tenía
 * un botón "Ver los más cercanos" que los necesita. Capacitor los pide en
 * tiempo de ejecución, y Android deniega en el acto —sin enseñar diálogo—
 * cualquier permiso no declarado en el manifest.
 *
 * Esta prueba existe para que eso no vuelva a colarse hasta el teléfono.
 */
const raiz = (p: string) => path.resolve(__dirname, "../..", p);
const MANIFEST = fs.readFileSync(raiz("android/app/src/main/AndroidManifest.xml"), "utf8");
const BUSCADOR = fs.readFileSync(raiz("src/pages/SearchPage.tsx"), "utf8");

const declara = (permiso: string) =>
  new RegExp(`uses-permission[^>]*android\\.permission\\.${permiso}`).test(MANIFEST);

describe("ubicación", () => {
  it("el buscador la pide desde el WebView, sin plugin", () => {
    // Si esto dejara de ser cierto (p. ej. se instala @capacitor/geolocation),
    // el permiso lo aportaría el plugin y esta prueba habría que revisarla.
    expect(BUSCADOR).toContain("navigator.geolocation.getCurrentPosition");
  });

  it("y por eso el manifest declara los dos permisos que Capacitor pide juntos", () => {
    expect(declara("ACCESS_COARSE_LOCATION")).toBe(true);
    expect(declara("ACCESS_FINE_LOCATION")).toBe(true);
  });

  it("basta con la aproximada: el buscador no pide alta precisión", () => {
    // Ordenar por cercanía no necesita precisión de metros, y pedirla de más
    // hace que más gente diga que no.
    expect(BUSCADOR).toContain("enableHighAccuracy: false");
  });
});

describe("lo básico sigue estando", () => {
  it("internet", () => {
    expect(declara("INTERNET")).toBe(true);
  });

  it("y no se cuela ubicación en SEGUNDO PLANO", () => {
    // `ACCESS_BACKGROUND_LOCATION` obliga a justificar el uso ante Play con un
    // vídeo y una revisión aparte. Esta app no la necesita: solo pide la
    // ubicación cuando alguien pulsa el botón.
    expect(declara("ACCESS_BACKGROUND_LOCATION")).toBe(false);
  });
});
