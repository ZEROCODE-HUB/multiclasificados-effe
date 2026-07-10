import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * El bug: con las tres insignias (Destacado, Urgente, Confidencial) en texto,
 * se envolvían y se pisaban con el badge "Verificado". Ahora van como iconos
 * compactos; el nombre sale en un tooltip al pasar el mouse.
 *
 * jsdom no mide layout, así que la no-superposición se comprueba en Chromium.
 */

const html = () =>
  harnessHtml({
    entry: "listingCard.tsx",
    stubs: path.join(DIR, "harness", "listingCardStubs.ts"),
    stubbed: ["@/hooks/useSession", "@/hooks/useFavorites"],
  });

test("las insignias no se superponen con 'Verificado'", async ({ page }) => {
  await page.setContent(await html());

  const destacado = page.getByLabel("Destacado");
  const urgente = page.getByLabel("Urgente");
  const confidencial = page.getByLabel("Confidencial");
  await expect(destacado).toBeVisible();
  await expect(urgente).toBeVisible();
  await expect(confidencial).toBeVisible();

  // Ningún icono (apilados por la izquierda) invade la franja de "Verificado".
  const verifBox = (await page.getByText("Verificado").boundingBox())!;
  for (const b of [destacado, urgente, confidencial]) {
    const box = (await b.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(verifBox.x);
  }
});

test("al pasar el mouse por una insignia sale su nombre", async ({ page }) => {
  await page.setContent(await html());
  await page.getByLabel("Urgente").hover();
  // El tooltip de Radix monta el texto al abrir (puede haber varios nodos).
  await expect(page.getByRole("tooltip").filter({ hasText: "Urgente" }).first()).toBeVisible();
});
