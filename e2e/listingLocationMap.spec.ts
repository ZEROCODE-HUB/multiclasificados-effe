import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";
import { ENTORNO_DE_MAPAS, hayLlaveDeMapas, MAPA_DE_GOOGLE } from "./harness/googleEnv";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * El mapa de la ficha del aviso, en Chromium y con el SDK real.
 *
 * El bug original (MOB-10): era un iframe de OpenStreetMap tapado con
 * `pointer-events-none`, y en iOS atrapaba el toque — la página no scrolleaba y
 * el mapa tampoco se movía. Después fue Leaflet con el pin anclado y un apaño de
 * `touch-action`. Ahora es Google, y la convivencia con el scroll la resuelve
 * `gestureHandling: "cooperative"`, que es una opción del propio mapa.
 *
 * jsdom no monta un mapa ni calcula estilos en cascada, así que esto se
 * comprueba aquí. Sin llave en el `.env` estas pruebas se saltan solas.
 */

test.skip(!hayLlaveDeMapas(), "sin VITE_GOOGLE_MAPS_API_KEY no hay mapa que probar");

const html = () =>
  harnessHtml({
    entry: "listingLocationMap.tsx",
    stubs: path.join(DIR, "harness", "stubs.ts"),
    stubbed: [],
    env: ENTORNO_DE_MAPAS,
  });

const mapaVisible = async (page: import("@playwright/test").Page) => {
  await expect(page.locator(MAPA_DE_GOOGLE)).toBeVisible({ timeout: 15_000 });
};

test("el mapa es un mapa de verdad, no un embed tapado", async ({ page }) => {
  await page.setContent(await html());
  await mapaVisible(page);

  // El embed viejo no debe volver: era la causa de que el toque se perdiera.
  // (Google monta iframes internos suyos, así que no vale contar iframes a
  // secas: lo que no puede haber es un mapa ajeno incrustado.)
  await expect(page.locator('iframe[src*="openstreetmap"]')).toHaveCount(0);

  // Y el mapa recibe el puntero, que es lo que el embed anulaba con
  // `pointer-events: none` para que el pin no se despegara de su sitio.
  const recibeElPuntero = await page
    .locator(MAPA_DE_GOOGLE)
    .evaluate((el) => getComputedStyle(el).pointerEvents !== "none");
  expect(recibeElPuntero).toBe(true);
});

test("el pin de precio está anclado al mapa y muestra el precio", async ({ page }) => {
  await page.setContent(await html());
  await mapaVisible(page);

  const pin = page.getByText("US$ 185,000");
  await expect(pin).toBeVisible();
  // Dentro del mapa: se mueve CON él, que es justo lo que el iframe no podía
  // hacer (el pin iba fijo al centro de la caja).
  await expect(page.locator(MAPA_DE_GOOGLE).getByText("US$ 185,000")).toBeVisible();
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
  await mapaVisible(page);

  // El mapa vive al final de la ficha: sin esto queda fuera de la ventana y el
  // ratón no llega a tocarlo.
  await page.locator(MAPA_DE_GOOGLE).scrollIntoViewIfNeeded();

  const pin = page.locator(MAPA_DE_GOOGLE).getByText("US$ 185,000");
  await expect(pin).toBeVisible();
  const inicio = (await pin.boundingBox())!;

  // Arrastra el mapa lo bastante para sacar el pin de su sitio. Se agarra por
  // una esquina: en el centro está el propio pin, que se traga el arrastre.
  const mapa = (await page.locator(MAPA_DE_GOOGLE).boundingBox())!;
  await page.mouse.move(mapa.x + 40, mapa.y + 40);
  await page.mouse.down();
  await page.mouse.move(mapa.x + mapa.width - 40, mapa.y + 40, { steps: 10 });
  await page.mouse.up();

  await expect
    .poll(async () => Math.abs((await pin.boundingBox())!.x - inicio.x))
    .toBeGreaterThan(50);

  await page.getByLabel("Centrar en la ubicación del aviso").click();

  await expect
    .poll(async () => Math.abs((await pin.boundingBox())!.x - inicio.x), { timeout: 5000 })
    .toBeLessThan(4);
});

/**
 * MOB-06: los controles llevaban z-index 600. Esta sección no crea un contexto
 * de apilamiento propio, así que ese 600 competía contra el z-50 de la barra
 * superior y se le montaba encima al hacer scroll.
 */
test("los controles del mapa quedan por debajo de la barra superior", async ({ page }) => {
  await page.setContent(await html());

  const zControles = await page.getByLabel("Acercar").evaluate(
    (el) => Number(getComputedStyle(el.parentElement!).zIndex),
  );

  const Z_NAVBAR = 50;
  expect(zControles).toBeLessThan(Z_NAVBAR);
  // …y por encima del mapa.
  expect(zControles).toBeGreaterThan(0);
});
