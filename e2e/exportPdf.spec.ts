import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { harnessHtml } from "./harness/build";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * El bug: el botón PDF avisaba "Reporte exportado" y no descargaba nada (abría
 * el diálogo de impresión, y con el popup bloqueado ni eso). Los tests de jsdom
 * simulan el <a> y el Blob, así que no prueban que el navegador descargue de
 * verdad. Esto sí: Chromium real, evento `download`, fichero en disco.
 */

const html = () =>
  harnessHtml({
    entry: "reports.tsx",
    stubs: path.join(DIR, "harness", "reportsStubs.ts"),
    stubbed: ["@/lib/admin", "@/hooks/useCategories", "@/lib/supabase", "@/hooks/use-toast"],
  });

test("el botón PDF descarga un .pdf legible", async ({ page }) => {
  const popups: unknown[] = [];
  page.on("popup", (p) => popups.push(p));

  await page.setContent(await html());
  await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PDF" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("reporte-dashboard.pdf");

  const destino = path.join(test.info().outputDir, "reporte.pdf");
  await download.saveAs(destino);

  const bytes = fs.readFileSync(destino);
  expect(bytes.length).toBeGreaterThan(500);
  // Un PDF de verdad, no la tabla HTML de antes.
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.toString("latin1")).toContain("%%EOF");

  // Los datos van dentro, con las tildes intactas (WinAnsi: "í" = 0xED).
  expect(bytes.toString("latin1")).toContain("Veh\xedculos");

  // Y no se abrió ninguna pestaña para imprimir.
  expect(popups).toHaveLength(0);
});

test("CSV y Excel siguen descargando", async ({ page }) => {
  await page.setContent(await html());

  for (const [boton, fichero] of [["CSV", "reporte-dashboard.csv"], ["Excel", "reporte-dashboard.xls"]] as const) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: boton }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(fichero);
  }
});
