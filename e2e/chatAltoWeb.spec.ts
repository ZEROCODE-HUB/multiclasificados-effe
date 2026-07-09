import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * El bug: en escritorio el chat medía `100vh - 12rem`, un número mágico que ya
 * no cuadraba con el cromo real de la página (navbar + cabecera + paddings +
 * un <h1> duplicado). El contenedor sobresalía de la ventana y había que
 * scrollear la página entera para llegar al campo de escritura.
 *
 * jsdom no calcula layout, así que esto solo se puede comprobar en un navegador
 * de verdad: aquí se monta MessagesPage con su DashboardLayout y su Navbar
 * reales y se mide la ventana.
 */

const html = () =>
  harnessHtml({
    entry: "chat.tsx",
    stubs: path.join(DIR, "harness", "chatStubs.tsx"),
    stubbed: [
      "@/lib/messaging", "@/lib/pricing", "@/lib/reports", "@/lib/supabase",
      "@/hooks/use-toast", "@/hooks/useSession", "@/hooks/useCategories",
      "@/hooks/useUnreadMessages", "@/components/NotificationsBell",
      "@/components/CreditsBalance", "@/lib/auth",
    ],
  });

const escribir = "Escribe un mensaje...";

test.describe("chat en escritorio", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("el campo de escritura se ve sin scrollear la página", async ({ page }) => {
    await page.setContent(await html());
    const input = page.getByPlaceholder(escribir);
    await expect(input).toBeVisible();

    // La página no puede scrollear: el chat cabe exacto en la ventana.
    const { scrollHeight, clientHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);

    // Y el input está dentro de la ventana sin mover nada.
    const caja = await input.boundingBox();
    expect(caja).not.toBeNull();
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(800);
  });

  test("intentar scrollear la página no la mueve", async ({ page }) => {
    await page.setContent(await html());
    await expect(page.getByPlaceholder(escribir)).toBeVisible();

    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("los mensajes scrollean por dentro, no la página", async ({ page }) => {
    await page.setContent(await html());
    await expect(page.getByPlaceholder(escribir)).toBeVisible();
    // El mismo texto sale en la vista previa de la conversación; el último es la burbuja.
    await expect(page.getByText("Mensaje número 30 de la conversación.").last()).toBeVisible();

    // El panel de mensajes es el que desborda y tiene su propio scroll.
    const desborda = await page.evaluate(() => {
      const el = [...document.querySelectorAll("div")].find(
        (d) => d.className.includes("overflow-y-auto") && d.scrollHeight > d.clientHeight + 1,
      );
      return !!el;
    });
    expect(desborda).toBe(true);
  });

  test("el título 'Mensajes' aparece una sola vez", async ({ page }) => {
    await page.setContent(await html());
    await expect(page.getByPlaceholder(escribir)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mensajes" })).toHaveCount(1);
  });
});

test.describe("chat en móvil (no debe cambiar)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("el campo de escritura sigue visible y fijo", async ({ page }) => {
    await page.setContent(await html());
    const input = page.getByPlaceholder(escribir);
    await expect(input).toBeVisible();

    const caja = await input.boundingBox();
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(844);
  });
});
