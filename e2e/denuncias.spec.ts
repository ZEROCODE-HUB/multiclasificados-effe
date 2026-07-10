import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

/**
 * Lo que jsdom no puede afirmar: que Chromium ignore de verdad los clics sobre un
 * botón deshabilitado, y que el enlace al aviso navegue. Aquí el componente es el
 * real y el navegador también.
 */

const DIR = path.dirname(fileURLToPath(import.meta.url));

const html = () =>
  harnessHtml({
    entry: "denuncias.tsx",
    stubs: path.join(DIR, "harness", "denunciasStubs.ts"),
    stubbed: ["@/lib/admin", "@/lib/supabase", "@/hooks/use-toast"],
  });

const abrirDenuncia = async (page: import("@playwright/test").Page) => {
  await page.setContent(await html());
  await page.getByRole("button", { name: /Ana García → Luis Paz/ }).click();
  await expect(page.getByText("Detalle de la denuncia")).toBeVisible();
};

test('"Ver aviso" muestra el aviso sin navegar a ninguna parte', async ({ page }) => {
  await abrirDenuncia(page);
  const antes = page.url();

  await page.getByRole("button", { name: "Ver aviso" }).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText("Bonita casa en la sierra");
  await expect(dialogo).toContainText("Oscar Mijael Pérez García");
  await expect(dialogo).toContainText("Rechazado"); // deshabilitado y aun así visible
  await expect(dialogo).toContainText("Removido por moderación");

  // Lo que pidió el usuario: que no lo saque a /aviso/:id.
  expect(page.url()).toBe(antes);
  await expect(page.getByRole("link", { name: "Ver aviso" })).toHaveCount(0);

  // Y la denuncia sigue debajo al cerrar.
  await page.keyboard.press("Escape");
  await expect(page.getByText("Detalle de la denuncia")).toBeVisible();
});

test('"Marcar en revisión" no admite un segundo clic mientras trabaja', async ({ page }) => {
  await abrirDenuncia(page);

  const btn = page.getByRole("button", { name: "Marcar en revisión" });
  await btn.click();

  // Con la petición en vuelo el botón queda inerte: Chromium no entrega el clic.
  await expect(btn).toBeDisabled();
  await btn.click({ force: true, timeout: 1000 }).catch(() => {});
  await btn.click({ force: true, timeout: 1000 }).catch(() => {});

  // Al resolverse, la denuncia pasa a "En revisión" y el botón sigue bloqueado.
  await expect(page.getByRole("button", { name: "En revisión" })).toBeDisabled();

  const asignaciones = await page.evaluate(() => (window as unknown as { __calls: { assign: number } }).__calls.assign);
  expect(asignaciones).toBe(1);
});

test('"Advertir usuario" resuelve la denuncia con la acción warn', async ({ page }) => {
  await abrirDenuncia(page);

  await page.getByRole("button", { name: "Advertir usuario" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __calls: { resolve: string[] } }).__calls.resolve))
    .toEqual(["warn"]);
});
