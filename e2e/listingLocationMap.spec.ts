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

/**
 * MOB-04: si el usuario arrastraba el mapa hasta perder de vista el punto del
 * aviso, no había forma de volver a él salvo recargando la pantalla.
 */
test("se puede volver a la ubicación del aviso tras arrastrar el mapa", async ({ page }) => {
  await page.setContent(await html());

  // El mapa vive al final de la ficha: sin esto queda fuera de la ventana y el
  // ratón no llega a tocarlo.
  await page.locator(".leaflet-container").scrollIntoViewIfNeeded();

  const pin = page.locator(".leaflet-marker-pane").getByText("US$ 185,000");
  const inicio = (await pin.boundingBox())!;

  // Arrastra el mapa lo bastante para sacar el pin de su sitio. Se agarra por
  // una esquina: en el centro está el propio pin, que se traga el arrastre.
  const mapa = (await page.locator(".leaflet-container").boundingBox())!;
  await page.mouse.move(mapa.x + 40, mapa.y + 40);
  await page.mouse.down();
  await page.mouse.move(mapa.x + mapa.width - 40, mapa.y + 40, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => Math.abs((await pin.boundingBox())!.x - inicio.x))
    .toBeGreaterThan(50);

  await page.getByLabel("Centrar en la ubicación del aviso").click();

  // flyTo es animado: se espera a que el pin vuelva a su posición original.
  await expect
    .poll(async () => Math.abs((await pin.boundingBox())!.x - inicio.x), { timeout: 5000 })
    .toBeLessThan(2);
});

/**
 * MOB-06: el hint y los controles llevaban z-index 600. Esta sección no crea un
 * contexto de apilamiento propio, así que ese 600 competía contra el z-50 de la
 * barra superior y se le montaba encima al hacer scroll.
 */
test("los adornos del mapa quedan por debajo de la barra superior", async ({ page }) => {
  await page.setContent(await html());

  // El hint solo se muestra en pantallas táctiles, pero su z-index se computa
  // igual y es lo que se está fijando aquí. El z-index vive en el contenedor
  // posicionado, no en el texto.
  const zHint = await page
    .getByText("Usa dos dedos para mover el mapa")
    .evaluate((el) => Number(getComputedStyle(el.parentElement!).zIndex));
  const zControles = await page.getByLabel("Acercar").evaluate(
    (el) => Number(getComputedStyle(el.parentElement!).zIndex),
  );

  const Z_NAVBAR = 50;
  expect(zHint).toBeLessThan(Z_NAVBAR);
  expect(zControles).toBeLessThan(Z_NAVBAR);
  // …y por encima del mapa, que va en z-0.
  expect(zControles).toBeGreaterThan(0);
});
