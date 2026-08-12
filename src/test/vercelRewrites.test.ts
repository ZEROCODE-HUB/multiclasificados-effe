// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * La reescritura de rutas de `vercel.json`, que es fácil de romper sin notarlo
 * porque no falla al desplegar: falla en el navegador de un usuario.
 *
 * Era `/(.*) -> /index.html`, o sea TODO. Un archivo de código que no existe
 * (pasa en cada despliegue con las pestañas ya abiertas, porque los nombres
 * llevan el hash del contenido) devolvía el HTML de la app con código 200. El
 * navegador intentaba ejecutar HTML como JavaScript y salía:
 *
 *   TypeError: Failed to fetch dynamically imported module: .../SettingsPage-tBDPHwQP.js
 *
 * Un 404 honesto habría dicho lo que pasaba a la primera.
 */

const vercel = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"),
) as { rewrites: Array<{ source: string; destination: string }> };

const reglaSpa = vercel.rewrites.find((r) => r.destination === "/index.html")!;
// Vercel resuelve `source` como expresión regular anclada a la ruta completa.
const coincide = (ruta: string) => new RegExp(`^${reglaSpa.source}$`).test(ruta);

describe("vercel.json — la reescritura SPA no se traga los assets", () => {
  it("existe una regla que manda al index.html", () => {
    expect(reglaSpa).toBeTruthy();
  });

  it("las rutas de la app SÍ se reescriben (las resuelve el router)", () => {
    for (const ruta of [
      "/",
      "/buscar",
      "/dashboard/anunciante/configuracion",
      "/dashboard/admin/tarifas",
    ]) {
      expect(coincide(ruta), ruta).toBe(true);
    }
  });

  it("la ficha de un aviso va a la función de vista previa, y ANTES que la regla general", () => {
    // El orden importa: Vercel aplica la primera regla que coincide. Si la
    // general fuera antes, la función nunca se ejecutaría y los enlaces
    // compartidos volverían a la tarjeta genérica.
    const iFicha = vercel.rewrites.findIndex((r) => r.destination.startsWith("/api/og-aviso"));
    const iSpa = vercel.rewrites.findIndex((r) => r.destination === "/index.html");
    expect(iFicha).toBeGreaterThanOrEqual(0);
    expect(iFicha).toBeLessThan(iSpa);

    const ficha = vercel.rewrites[iFicha];
    expect(new RegExp(`^${ficha.source}$`).test("/aviso/01e6d187-aa3f-448d-802f-a69c17900d0c")).toBe(true);
    // Pero no se traga el listado ni otras rutas.
    expect(new RegExp(`^${ficha.source}$`).test("/buscar")).toBe(false);
  });

  it("las rutas de /api tampoco se reescriben, o la función se llamaría a sí misma", () => {
    expect(coincide("/api/og-aviso")).toBe(false);
  });

  it("los archivos de /assets NO se reescriben: si faltan, deben dar 404", () => {
    for (const archivo of [
      "/assets/SettingsPage-tBDPHwQP.js",
      "/assets/index-C3UicwE2.js",
      "/assets/index-abc123.css",
    ]) {
      expect(coincide(archivo), archivo).toBe(false);
    }
  });

  it("una ruta que solo EMPIEZA por algo parecido sigue reescribiéndose", () => {
    // Que la exclusión no se pase de lista y rompa rutas legítimas.
    expect(coincide("/assetsxyz")).toBe(true);
    expect(coincide("/mis-assets/foo")).toBe(true);
  });
});
