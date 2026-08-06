import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * MOB-03: en el detalle del aviso, la fila "Guardar / Compartir / Reportar" se
 * veía en una sola línea, pero al tocar "Guardar" el texto pasaba a "Guardado",
 * la fila crecía unos píxeles y en 375px "Reportar" saltaba a una segunda línea.
 *
 * Esto solo se puede comprobar en un navegador de verdad: jsdom no mide texto
 * ni resuelve el layout, que es justo lo que aquí falla.
 */

const html = () =>
  harnessHtml({
    entry: "listingActionsRow.tsx",
    stubs: path.join(DIR, "harness", "stubs.ts"),
    stubbed: [],
  });

// Todos los botones comparten la misma línea si comparten el borde superior.
const filas = (cajas: { y: number }[]) => new Set(cajas.map((c) => Math.round(c.y))).size;

async function cajas(page: import("@playwright/test").Page) {
  const botones = await page.getByRole("button").all();
  return Promise.all(botones.map(async (b) => (await b.boundingBox())!));
}

test.use({ viewport: { width: 375, height: 700 } });

test("los tres botones caben en una línea", async ({ page }) => {
  await page.setContent(await html());
  await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();

  expect(filas(await cajas(page))).toBe(1);
});

test("al marcar favorito la fila NO salta a dos líneas", async ({ page }) => {
  await page.setContent(await html());

  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Guardado" })).toBeVisible();

  expect(filas(await cajas(page))).toBe(1);
});

test("marcar favorito no cambia el ancho de ningún botón", async ({ page }) => {
  await page.setContent(await html());
  const antes = (await cajas(page)).map((c) => Math.round(c.width));

  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("button", { name: "Guardado" })).toBeVisible();

  expect((await cajas(page)).map((c) => Math.round(c.width))).toEqual(antes);
});

test("ningún texto se desborda de su botón", async ({ page }) => {
  await page.setContent(await html());
  await page.getByRole("button", { name: "Guardar" }).click();

  for (const boton of await page.getByRole("button").all()) {
    const desborda = await boton.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(desborda).toBe(false);
  }
});
