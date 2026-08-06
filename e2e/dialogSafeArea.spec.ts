import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * MOB-05 (crítico): un pop-up lo bastante alto quedaba centrado respecto a la
 * PANTALLA, así que su borde superior terminaba debajo del notch / Dynamic
 * Island. Esa franja no se ve ni se puede tocar: si ahí caía el botón de cerrar,
 * el modal atrapaba al usuario.
 *
 * `env(safe-area-inset-*)` siempre vale 0 en un navegador de escritorio y no hay
 * forma de forzarlo, por eso index.css lo expone como --safe-top / --safe-bottom:
 * aquí se pisan esas variables para simular un iPhone con notch.
 */

// Insets de un iPhone 15 Pro en vertical.
const NOTCH = 59;
const HOME = 34;

const html = () =>
  harnessHtml({
    entry: "dialogSafeArea.tsx",
    stubs: path.join(DIR, "harness", "stubs.ts"),
    stubbed: [],
  });

test.use({ viewport: { width: 390, height: 844 } });

async function montar(page: import("@playwright/test").Page, insets: boolean) {
  await page.setContent(await html());
  // El modal entra con un zoom del 95% al 100%: medir a media animación da
  // tamaños intermedios. Se congela el estado final.
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  if (insets) {
    await page.evaluate(
      ([top, bottom]) => {
        document.documentElement.style.setProperty("--safe-top", `${top}px`);
        document.documentElement.style.setProperty("--safe-bottom", `${bottom}px`);
      },
      [NOTCH, HOME],
    );
  }
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  return modal;
}

test("en un iPhone con notch, el modal largo no se mete debajo de la isla", async ({ page }) => {
  const modal = await montar(page, true);
  const caja = (await modal.boundingBox())!;

  expect(caja.y).toBeGreaterThanOrEqual(NOTCH);
});

test("tampoco se mete debajo del indicador de inicio", async ({ page }) => {
  const modal = await montar(page, true);
  const caja = (await modal.boundingBox())!;
  const alto = page.viewportSize()!.height;

  expect(caja.y + caja.height).toBeLessThanOrEqual(alto - HOME);
});

test("el título y el botón de cerrar quedan dentro del área tocable", async ({ page }) => {
  const modal = await montar(page, true);

  // Lo que el bug hacía inalcanzable: la cabecera del modal.
  const titulo = (await modal.getByText("Reportar usuario").boundingBox())!;
  expect(titulo.y).toBeGreaterThanOrEqual(NOTCH);

  const cerrar = (await modal.getByRole("button", { name: /close/i }).boundingBox())!;
  expect(cerrar.y).toBeGreaterThanOrEqual(NOTCH);
});

test("sin insets (Android y web) el modal sigue centrado como siempre", async ({ page }) => {
  const modal = await montar(page, false);
  const caja = (await modal.boundingBox())!;
  const alto = page.viewportSize()!.height;

  // Simétrico arriba y abajo, con el margen de 1rem de siempre.
  expect(Math.round(caja.y)).toBe(16);
  expect(Math.round(alto - (caja.y + caja.height))).toBe(16);
});
