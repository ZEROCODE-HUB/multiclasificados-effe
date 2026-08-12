import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Las categorías de la portada, medidas en un navegador de verdad.
 *
 * En escritorio la rejilla se quedaba en 4 columnas con tarjetas 4:3: a 1920 px
 * cada una medía ~472×354 y las 12 categorías ocupaban una pantalla entera.
 *
 * Lo que hay que vigilar es que compactar el escritorio NO toque el móvil: la
 * sección es el mismo DOM en los dos (no hay versión aparte), así que basta con
 * quitarle el prefijo a una clase para estropear el teléfono sin que nadie lo
 * note. Por eso la última prueba es la más importante de las tres.
 */

const html = () =>
  harnessHtml({
    entry: "categoryGridAncho.tsx",
    stubs: path.join(DIR, "harness", "categoryGridStubs.ts"),
    stubbed: ["@/hooks/useCategories", "@/lib/stats", "@/lib/categories"],
  });

/** Cuántas tarjetas comparten la primera fila (mismo borde superior). */
async function columnas(page: Page): Promise<number> {
  const cajas = await Promise.all(
    (await page.getByRole("link").all()).map(async (l) => (await l.boundingBox())!),
  );
  const primera = Math.min(...cajas.map((c) => Math.round(c.y)));
  return cajas.filter((c) => Math.round(c.y) === primera).length;
}

const altoTotal = async (page: Page) =>
  (await page.locator(".grid").first().boundingBox())!.height;

const abrir = async (page: Page, ancho: number) => {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.setContent(await html());
  await expect(page.getByRole("link").first()).toBeVisible();
};

test("a 1920px salen 6 columnas y la sección deja de comerse la pantalla", async ({ page }) => {
  await abrir(page, 1920);
  expect(await columnas(page)).toBe(6);
  // Con 12 categorías en 6 columnas son 2 filas. Antes eran 3 filas de ~354 px
  // (~1060 px); el tope de 500 deja margen de sobra y sigue siendo un fallo
  // claro si alguien vuelve a las tarjetas altas.
  expect(await altoTotal(page)).toBeLessThan(500);
});

test("a 1280px salen 5 columnas", async ({ page }) => {
  await abrir(page, 1280);
  expect(await columnas(page)).toBe(5);
});

test("a 1024px se mantienen las 4 de siempre", async ({ page }) => {
  await abrir(page, 1024);
  expect(await columnas(page)).toBe(4);
});

test("las tarjetas son apaisadas en escritorio (16:9), no 4:3", async ({ page }) => {
  await abrir(page, 1920);
  const caja = (await page.getByRole("link").first().boundingBox())!;
  expect(caja.width / caja.height).toBeGreaterThan(1.5);
});

test("EN MÓVIL NO CAMBIA NADA: 2 columnas y tarjetas 4:3", async ({ page }) => {
  // La prueba que de verdad protege este cambio. Si alguien quita un prefijo
  // `md:`, aquí se ve; en escritorio no se notaría.
  await abrir(page, 376);
  expect(await columnas(page)).toBe(2);

  const caja = (await page.getByRole("link").first().boundingBox())!;
  expect(caja.width / caja.height).toBeCloseTo(4 / 3, 1);
});
