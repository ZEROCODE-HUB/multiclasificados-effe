import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENTORNO_DE_MAPAS, hayLlaveDeMapas } from "./harness/googleEnv";

/**
 * ¿Deja la CSP de producción cargar el mapa?
 *
 * Esta prueba existe porque el fallo que evita es invisible en desarrollo: la
 * cabecera `Content-Security-Policy` la pone Vercel, así que en local todo
 * funciona y el mapa solo desaparece una vez desplegado. Ocurrió de verdad: al
 * pasar los mapas a Google, la CSP que había en `vercel.json` no incluía
 * `maps.googleapis.com` en `script-src` y el SDK quedaba bloqueado en seco.
 *
 * No se copia aquí la política: se LEE de vercel.json. Si alguien la endurece
 * mañana y se deja fuera a Google, esta prueba se entera.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEN = "https://csp-effe.test";

test.skip(!hayLlaveDeMapas(), "sin VITE_GOOGLE_MAPS_API_KEY no hay mapa que probar");

/** Las políticas declaradas en vercel.json, por nombre de cabecera. */
function politicas(): Record<string, string> {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  const cabeceras: Array<{ key: string; value: string }> = cfg.headers.flatMap(
    (h: { headers: Array<{ key: string; value: string }> }) => h.headers,
  );
  return Object.fromEntries(
    cabeceras
      .filter((h) => h.key.toLowerCase().startsWith("content-security-policy"))
      .map((h) => [h.key, h.value]),
  );
}

// La página es un calco de lo que hace la app: un <script> propio (servido
// desde el mismo origen, como el bundle) que carga el SDK y pinta un mapa con
// un marcador moderno, que es lo que exige el Map ID.
const HTML = `<!doctype html><html><body><div id="m" style="width:400px;height:300px"></div><script src="/app.js"></script></body></html>`;

const appJs = (key: string, mapId: string) => `
window.__estado = "sin empezar";
window.__violaciones = [];
addEventListener("securitypolicyviolation", (e) => {
  window.__violaciones.push(e.effectiveDirective + " bloqueó " + String(e.blockedURI).split("?")[0]);
});
window.arranca = async () => {
  try {
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    const mapa = new Map(document.getElementById("m"),
      { center: { lat: -12.05, lng: -77.04 }, zoom: 13, mapId: ${JSON.stringify(mapId)} });
    const pin = document.createElement("div");
    pin.textContent = "S/ 100";
    new AdvancedMarkerElement({ map: mapa, position: { lat: -12.05, lng: -77.04 }, content: pin });
    google.maps.event.addListenerOnce(mapa, "idle", () => { window.__estado = "mapa pintado"; });
  } catch (e) { window.__estado = "error: " + e.message; }
};
const s = document.createElement("script");
s.src = "https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly&libraries=maps,marker&language=es&region=PE&callback=arranca";
s.onerror = () => { window.__estado = "el SDK no pudo cargarse"; };
document.head.appendChild(s);
`;

async function cargarConCSP(page: import("@playwright/test").Page, csp: string) {
  const js = appJs(ENTORNO_DE_MAPAS.VITE_GOOGLE_MAPS_API_KEY, ENTORNO_DE_MAPAS.VITE_GOOGLE_MAPS_MAP_ID);
  await page.route(`${ORIGEN}/**`, (route) =>
    route.request().url().endsWith("/app.js")
      ? route.fulfill({ status: 200, headers: { "content-type": "application/javascript" }, body: js })
      : route.fulfill({
          status: 200,
          headers: { "content-type": "text/html", "Content-Security-Policy": csp },
          body: HTML,
        }),
  );
  await page.goto(`${ORIGEN}/`);
  await page.waitForFunction(() => (window as never as { __estado: string }).__estado !== "sin empezar", null, { timeout: 25_000 })
    .catch(() => { /* el mensaje lo da la aserción de abajo */ });
  return page.evaluate(() => ({
    estado: (window as never as { __estado: string }).__estado,
    violaciones: [...new Set((window as never as { __violaciones: string[] }).__violaciones)],
  }));
}

for (const [cabecera, valor] of Object.entries(politicas())) {
  test(`${cabecera} deja cargar el mapa`, async ({ page }) => {
    const r = await cargarConCSP(page, valor);
    // Las violaciones van en el mensaje: si falla, se lee directamente qué
    // directiva falta en vez de tener que reproducirlo a mano.
    expect(r.violaciones, `Violaciones de CSP: ${r.violaciones.join(" · ")}`).toEqual([]);
    expect(r.estado).toBe("mapa pintado");
  });
}

test("la política ya no arrastra restos de OpenStreetMap", async () => {
  // Quedaban de cuando el mapa era Leaflet. No rompen nada, pero permiten
  // conexiones que la app ya no hace, y eso es justo lo que una CSP no debe
  // hacer.
  for (const valor of Object.values(politicas())) {
    expect(valor).not.toContain("openstreetmap");
  }
});
