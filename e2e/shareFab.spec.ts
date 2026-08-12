import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * El botón flotante de compartir es el primer elemento flotante de la app, y
 * cae justo donde ya hemos tropezado antes: encima de la barra inferior del
 * móvil y del indicador de inicio de iOS (fue MOB-04 con los toasts).
 *
 * Se posiciona con `bottom-[calc(1rem+var(--nav-bottom))]`. Que esa cuenta sea
 * correcta solo se puede comprobar midiendo en un navegador de verdad: jsdom no
 * resuelve `calc()` sobre variables CSS ni hace layout.
 */

const html = () =>
  harnessHtml({
    entry: "shareFab.tsx",
    stubs: path.join(DIR, "harness", "stubs.ts"),
    stubbed: [],
  });

const fab = (page: Page) => page.getByRole("button", { name: "Compartir este aviso" });

async function caja(page: Page, locator: ReturnType<typeof fab>) {
  const b = await locator.boundingBox();
  expect(b, "el elemento no se está pintando").not.toBeNull();
  return b!;
}

test.describe("móvil (375px)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("el botón no se solapa con la barra inferior", async ({ page }) => {
    await page.setContent(await html());
    await expect(fab(page)).toBeVisible();

    const boton = await caja(page, fab(page));
    const barra = await caja(page, page.getByTestId("barra-inferior") as never);

    // El borde de abajo del botón queda por encima del de arriba de la barra.
    expect(boton.y + boton.height).toBeLessThanOrEqual(barra.y);
  });

  test("el botón entra entero en pantalla", async ({ page }) => {
    await page.setContent(await html());
    const b = await caja(page, fab(page));
    const vp = page.viewportSize()!;

    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
  });

  test("sigue en su sitio tras hacer scroll: es fijo, no absoluto", async ({ page }) => {
    await page.setContent(await html());
    const antes = await caja(page, fab(page));

    await page.mouse.wheel(0, 800);
    await expect(fab(page)).toBeVisible();

    const despues = await caja(page, fab(page));
    expect(Math.round(despues.y)).toBe(Math.round(antes.y));
  });

  test("abre las mismas opciones que el botón de la fila de acciones", async ({ page }) => {
    await page.setContent(await html());
    await fab(page).click();

    await expect(page.getByRole("menuitem", { name: "WhatsApp" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Copiar enlace" })).toBeVisible();
  });

  test("el menú se abre hacia arriba y no queda debajo de la barra", async ({ page }) => {
    await page.setContent(await html());
    await fab(page).click();

    const menu = await caja(page, page.getByRole("menu") as never);
    const barra = await caja(page, page.getByTestId("barra-inferior") as never);

    expect(menu.y + menu.height).toBeLessThanOrEqual(barra.y);
  });
});

test.describe("escritorio (1280px)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("sin barra inferior el botón baja, y sigue entero en pantalla", async ({ page }) => {
    await page.setContent(await html());
    await expect(fab(page)).toBeVisible();

    const b = await caja(page, fab(page));
    const vp = page.viewportSize()!;

    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
    // Desde `lg` la barra es `lg:hidden` y `--nav-bottom` ya no reserva sus
    // 4rem: el botón se pega abajo, a 1rem del borde.
    expect(vp.height - (b.y + b.height)).toBeLessThan(32);
  });
});
