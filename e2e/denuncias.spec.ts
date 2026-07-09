import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";
import { LISTING_ID } from "./harness/denunciasStubs";

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

test('"Ver aviso" lleva al aviso denunciado, en una pestaña nueva', async ({ page }) => {
  await abrirDenuncia(page);

  const link = page.getByRole("link", { name: "Ver aviso" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", `/aviso/${LISTING_ID}`);
  await expect(link).toHaveAttribute("target", "_blank");
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
