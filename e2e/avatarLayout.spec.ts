import { test, expect, type Page } from "@playwright/test";
import { harnessHtml } from "./harness/build";

/**
 * Test de layout real: monta el componente REAL `AdminUsers` en Chromium con el CSS
 * de Tailwind compilado del proyecto, y mide el avatar de iniciales con
 * getBoundingClientRect(). jsdom no calcula layout, así que este es el único sitio
 * donde se puede comprobar de verdad que el círculo no se deforma.
 *
 * Regresión que cubre: sin `shrink-0`, el avatar es un hijo flex encogible y un
 * nombre de usuario largo le comía el ancho manteniendo la altura (32px de alto,
 * 19px de ancho) → el círculo salía ovalado.
 */

const AVATAR = "div.rounded-full.bg-primary";
const DESKTOP_AVATAR = `table td ${AVATAR}`;
const MOBILE_AVATAR = `div.md\\:hidden ${AVATAR}`;

let html: string;

test.beforeAll(async () => {
  html = await harnessHtml();
});

/** Ancho/alto renderizados de cada avatar visible, junto al nombre de su fila. */
const measure = (page: Page, selector: string) =>
  page.$$eval(selector, (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { initials: el.textContent!.trim(), width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
    }),
  );

/** Monta el harness y espera a que el avatar de ESA vista sea visible (la otra está oculta por breakpoint). */
const mount = async (page: Page, width: number, selector: string) => {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForSelector(selector, { state: "visible" });
};

test("el avatar sigue siendo un círculo perfecto aunque el nombre sea largo", async ({ page }) => {
  await mount(page, 1280, DESKTOP_AVATAR);

  const avatars = await measure(page, DESKTOP_AVATAR);
  expect(avatars).toHaveLength(4);

  for (const a of avatars) {
    expect.soft(a, `avatar ${a.initials}`).toMatchObject({ width: 32, height: 32 });
  }
});

test("sin shrink-0 el avatar se aplasta (el test detecta la regresión)", async ({ page }) => {
  await mount(page, 1280, DESKTOP_AVATAR);

  // Control negativo: si se quita la clase, el bug reaparece. Esto demuestra que la
  // aserción de arriba mide algo y que `shrink-0` es lo que sostiene el círculo.
  await page.$$eval(DESKTOP_AVATAR, (els) => els.forEach((el) => el.classList.remove("shrink-0")));

  const avatars = await measure(page, DESKTOP_AVATAR);
  const aplastados = avatars.filter((a) => a.width < a.height);

  expect(aplastados.length).toBeGreaterThan(0);
  for (const a of aplastados) expect(a.height).toBe(32);
});

test("en las tarjetas móviles el avatar también es circular", async ({ page }) => {
  await mount(page, 390, MOBILE_AVATAR);

  const avatars = await measure(page, MOBILE_AVATAR);
  expect(avatars).toHaveLength(4);

  for (const a of avatars) {
    expect.soft(a, `avatar ${a.initials}`).toMatchObject({ width: 40, height: 40 });
  }
});
