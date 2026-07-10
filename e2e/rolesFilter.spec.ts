import { test, expect, type Page } from "@playwright/test";
import { harnessHtml } from "./harness/build";
import { LEGACY_ANUNCIANTE } from "./harness/stubs";

/**
 * El rol "Anunciante" se consolidó en "Buscador": no había separación real de
 * permisos (RequireRole les da el mismo rango) y todo buscador ya podía publicar.
 *
 * Se comprueba contra el componente REAL en Chromium porque los desplegables son
 * Radix Select: solo montan sus opciones al abrirse, y abrirlos en jsdom no es
 * fiable. Aquí se hace click de verdad.
 */

const ROLES_ESPERADOS = ["Todos los roles", "Buscador", "Moderador", "Soporte", "Admin", "Super Admin"];

let html: string;

test.beforeAll(async () => {
  html = await harnessHtml();
});

const mount = async (page: Page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForSelector("table");
};

/** Abre un Radix Select y devuelve el texto de sus opciones, en orden. */
const openOptions = async (page: Page, trigger: ReturnType<Page["locator"]>) => {
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  const options = await listbox.getByRole("option").allInnerTexts();
  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
  return options.map((o) => o.trim());
};

test('el filtro por rol ya no ofrece "Anunciante"', async ({ page }) => {
  await mount(page);

  const filtro = page.getByRole("combobox").first();
  await expect(filtro).toHaveText("Todos los roles");

  const options = await openOptions(page, filtro);

  expect(options).toEqual(ROLES_ESPERADOS);
  expect(options).not.toContain("Anunciante");
});

test('el selector de asignación de rol tampoco ofrece "Anunciante"', async ({ page }) => {
  await mount(page);

  // El primer combobox es el filtro; los siguientes son el selector de rol de cada fila.
  const selectorDeFila = page.locator("table").getByRole("combobox").first();
  const options = await openOptions(page, selectorDeFila);

  expect(options).not.toContain("Anunciante");
  // Los asignables son los mismos del filtro, sin la opción "Todos los roles".
  expect(options).toEqual(ROLES_ESPERADOS.slice(1));
});

test('un usuario que aún tiene el rol viejo en la BD se muestra como "Buscador"', async ({ page }) => {
  await mount(page);

  // Fila del usuario cuya única fila en user_roles sigue siendo 'anunciante'.
  const fila = page.locator("tr", { hasText: LEGACY_ANUNCIANTE });
  const selector = fila.getByRole("combobox");

  // Sin la normalización el trigger quedaría vacío: el valor 'anunciante' ya no
  // tiene una opción que lo respalde.
  await expect(selector).toHaveText("Buscador");
});

test('filtrar por "Buscador" incluye a los usuarios con el rol viejo sin migrar', async ({ page }) => {
  await mount(page);

  await expect(page.locator("tbody tr")).toHaveCount(4);

  const filtro = page.getByRole("combobox").first();
  await filtro.click();
  await page.getByRole("option", { name: "Buscador", exact: true }).click();

  // Los 4 siguen visibles: 3 'buscador' + el que arrastra 'anunciante'.
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(page.locator("tbody")).toContainText(LEGACY_ANUNCIANTE);
});
