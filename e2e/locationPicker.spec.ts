import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";
import { ENTORNO_DE_MAPAS, hayLlaveDeMapas, MAPA_DE_GOOGLE } from "./harness/googleEnv";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Publicar un aviso tiene que ser marcar un punto en el mapa y nada más.
 *
 * Esto se comprueba en Chromium y no en jsdom porque lo que está en juego es
 * justo lo que jsdom no puede montar: que el mapa de Google se pinte de verdad
 * y que un clic sobre él acabe rellenando el departamento. En jsdom el mapa es
 * un div de mentira y el clic se simula a mano, así que ahí no se vería si el
 * mapa dejara de responder.
 *
 * Estas pruebas hablan con Google de verdad. Sin llave en el `.env` se saltan
 * solas, para que la suite siga corriendo en un clon sin credenciales.
 */

test.skip(!hayLlaveDeMapas(), "sin VITE_GOOGLE_MAPS_API_KEY no hay mapa que probar");

const html = () =>
  harnessHtml({
    entry: "locationPicker.tsx",
    stubs: path.join(DIR, "harness", "locationPickerStubs.ts"),
    stubbed: ["@/lib/geocode"],
    env: ENTORNO_DE_MAPAS,
  });

/** Toca el mapa por dentro, lejos del pin y de los controles. */
const tocarElMapa = async (page: import("@playwright/test").Page) => {
  const mapa = page.locator(MAPA_DE_GOOGLE);
  await expect(mapa).toBeVisible({ timeout: 15_000 });
  const caja = (await mapa.boundingBox())!;
  await page.mouse.click(caja.x + caja.width * 0.4, caja.y + caja.height * 0.55);
};

test("el mapa se ve al abrir, sin tener que desplegar nada", async ({ page }) => {
  await page.setContent(await html());

  await expect(page.locator(MAPA_DE_GOOGLE)).toBeVisible({ timeout: 15_000 });
  // Antes había que pulsar "Marcar el punto en el mapa (opcional)" para verlo.
  await expect(page.getByText(/Marca en el mapa dónde está tu aviso/i)).toBeVisible();
});

test("de entrada no se pide ni departamento ni distrito", async ({ page }) => {
  await page.setContent(await html());

  await expect(page.getByLabel(/^Departamento/i)).toHaveCount(0);
  await expect(page.getByLabel(/Distrito o referencia/i)).toHaveCount(0);
});

test("tocar el mapa rellena el departamento y la referencia", async ({ page }) => {
  await page.setContent(await html());
  await expect(page.locator("#valores")).toHaveText("—|—|sin punto");

  await tocarElMapa(page);

  await expect(page.locator("#valores")).toHaveText("15|Miraflores, Lima|con punto");
});

test("lo deducido se enseña como una frase, y los campos siguen sin aparecer", async ({ page }) => {
  await page.setContent(await html());
  await tocarElMapa(page);

  await expect(page.getByText(/Aparecerá en las búsquedas de/i)).toBeVisible();
  await expect(page.getByText(/Lima y Callao/)).toBeVisible();
  await expect(page.getByLabel(/^Departamento/i)).toHaveCount(0);
});

test("«Corregir» abre los campos para quien quiera ajustarlos", async ({ page }) => {
  await page.setContent(await html());
  await tocarElMapa(page);

  await page.getByRole("button", { name: /corregir/i }).click();

  await expect(page.getByLabel(/^Departamento/i)).toBeVisible();
  await expect(page.getByLabel(/Distrito o referencia/i)).toBeVisible();
});

/**
 * Las sugerencias flotan JUSTO encima del mapa. Es el sitio donde esto puede
 * romperse sin que nadie lo note: el mapa crea su propio contexto de
 * apilamiento, así que la lista puede verse y aun así no poder pulsarse.
 */
test("las sugerencias salen al escribir y se pueden pulsar sobre el mapa", async ({ page }) => {
  await page.setContent(await html());
  await expect(page.locator(MAPA_DE_GOOGLE)).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder(/dirección o un distrito/i).fill("mirafl");

  const lista = page.getByRole("listbox");
  await expect(lista).toBeVisible();
  // El mismo nombre dos veces: sin el contexto no habría forma de elegir.
  await expect(lista.getByText("Lima, Provincia de Lima")).toBeVisible();
  await expect(lista.getByText("Arequipa")).toBeVisible();

  // `click` comprueba que el elemento recibe el puntero de verdad: si el mapa
  // quedara por encima, esto fallaría aunque la lista se viera.
  await lista.getByText("Arequipa").click();

  // Se eligió el de Arequipa, así que el aviso va a Arequipa (04) y no a Lima.
  // Elegir mal la sugerencia archivaría el aviso a 1000 km de donde está.
  await expect(page.locator("#valores")).toHaveText("04|Miraflores, Arequipa|con punto");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("no queda ningún botón 'Buscar' que pulsar", async ({ page }) => {
  await page.setContent(await html());
  await expect(page.getByRole("button", { name: /^buscar$/i })).toHaveCount(0);
});

test("arrastrar el pin cambia el punto guardado", async ({ page }) => {
  await page.setContent(await html());
  await tocarElMapa(page);

  const punto = page.locator("#punto");
  await expect(punto).not.toHaveText("—");
  const antes = await punto.textContent();

  // El pin es el marcador arrastrable que el componente pone en el mapa.
  const pin = page.locator('[title="Arrastra para ajustar el punto"]').first();
  await expect(pin).toBeVisible();
  const caja = (await pin.boundingBox())!;

  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.mouse.down();
  await page.mouse.move(caja.x + 70, caja.y + 40, { steps: 12 });
  await page.mouse.up();

  // El pin NO se queda donde se soltó: el mapa se recentra en él, así que
  // comprobar su posición en pantalla no diría nada. Lo que importa es que la
  // coordenada guardada haya cambiado.
  await expect(punto).not.toHaveText(antes!);
  await expect(punto).not.toHaveText("—");
});
