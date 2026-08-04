import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * El bug (MOB-10): el mapa de la ficha era un iframe de OpenStreetMap tapado con
 * `pointer-events-none`, y en iOS atrapaba el toque — la página no scrolleaba y
 * el mapa tampoco se movía. Ahora es Leaflet con el pin anclado a la coordenada,
 * y la convivencia con el scroll se decide por `touch-action`.
 *
 * jsdom no calcula estilos en cascada ni monta Leaflet, así que esto se
 * comprueba en Chromium.
 */

const html = () =>
  harnessHtml({ entry: "listingLocationMap.tsx", stubs: path.join(DIR, "harness", "stubs.ts"), stubbed: [] });

test("el mapa es de Leaflet, no un iframe tapado", async ({ page }) => {
  await page.setContent(await html());

  await expect(page.locator(".leaflet-container")).toBeVisible();
  // El iframe viejo no debe volver: era la causa de que el toque se perdiera.
  await expect(page.locator("iframe")).toHaveCount(0);
});

test("deja scrollear la página con el dedo (touch-action: pan-y)", async ({ page }) => {
  await page.setContent(await html());

  // Leaflet pone `touch-action: none` en cuanto el arrastre y el zoom táctil
  // están activos; la regla .map-pan-y de index.css tiene que ganarle.
  const touchAction = await page
    .locator(".leaflet-container")
    .evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction).toBe("pan-y");
});

test("el pin de precio está anclado al mapa y muestra el precio", async ({ page }) => {
  await page.setContent(await html());

  const pin = page.getByText("US$ 185,000");
  await expect(pin).toBeVisible();
  // Dentro del panel de marcadores: se mueve CON el mapa, que es justo lo que
  // el iframe no podía hacer (el pin iba fijo al centro de la caja).
  await expect(page.locator(".leaflet-marker-pane").getByText("US$ 185,000")).toBeVisible();
});

test("los botones de zoom siguen disponibles", async ({ page }) => {
  await page.setContent(await html());

  await expect(page.getByLabel("Acercar")).toBeVisible();
  await expect(page.getByLabel("Alejar")).toBeVisible();
});
