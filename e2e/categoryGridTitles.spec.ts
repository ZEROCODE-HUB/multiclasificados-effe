import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * El bug: en la portada, los nombres largos ("Insumos Materias Primas y
 * Materiales", "Eventos, Entretenimiento y Equipos Deportivos") se salían de su
 * tarjeta. El `line-clamp-2` estaba en el MISMO elemento que un `flex`, y flex
 * pisa el `display: -webkit-box` que el recorte necesita, así que no recortaba
 * nada. Ahora la caja de altura fija es el div y el recorte va en el h3.
 *
 * jsdom no mide layout: esto se comprueba en Chromium.
 */

const html = () =>
  harnessHtml({
    entry: "categoryGrid.tsx",
    stubs: path.join(DIR, "harness", "categoryGridStubs.ts"),
    stubbed: ["@/hooks/useCategories", "@/lib/stats", "@/lib/categories"],
  });

test("ningún título pasa de dos líneas, por largo que sea el nombre", async ({ page }) => {
  await page.setContent(await html());

  const titulos = page.getByRole("heading", { level: 3 });
  await expect(titulos.first()).toBeVisible();

  for (const titulo of await titulos.all()) {
    const alto = (await titulo.boundingBox())!.height;
    const lineHeight = await titulo.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    // +1px de holgura por el redondeo del layout.
    expect(alto).toBeLessThanOrEqual(lineHeight * 2 + 1);
  }
});

test("el nombre que no cabe termina en puntos suspensivos", async ({ page }) => {
  await page.setContent(await html());

  const largo = page.getByRole("heading", { name: "Eventos, Entretenimiento y Equipos Deportivos" });
  // -webkit-line-clamp pinta la elipsis; lo comprobable es que el texto
  // renderizado ocupa menos que el completo (scrollHeight > clientHeight).
  const recortado = await largo.evaluate((el) => el.scrollHeight > el.clientHeight);
  expect(recortado).toBe(true);
});

test("ya no se muestra el rótulo 'Categoría' en cada tarjeta", async ({ page }) => {
  await page.setContent(await html());
  await expect(page.getByText("Categoría", { exact: true })).toHaveCount(0);
});
