import { defineConfig, devices } from "@playwright/test";

/**
 * Config propia para los tests de layout (`npm run test:layout`).
 *
 * No se toca `playwright.config.ts`: ese depende de `lovable-agent-playwright-config`,
 * que no está instalado en el repo, así que hoy no arranca.
 *
 * Estos specs no necesitan servidor: montan el componente en la página con un bundle
 * de esbuild y el CSS de Tailwind compilado al vuelo.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"] },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
