import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessHtml } from "./harness/build";

/**
 * QA del modo mantenimiento en un navegador real. El interruptor guardaba el
 * valor y nadie lo leía: la app nunca se bloqueaba.
 */

const DIR = path.dirname(fileURLToPath(import.meta.url));

const html = () =>
  harnessHtml({
    entry: "mantenimiento.tsx",
    stubs: path.join(DIR, "harness", "mantenimientoStubs.ts"),
    stubbed: ["@/lib/maintenance", "@/hooks/useSession", "@/lib/supabase"],
  });

const APP = "contenido de la plataforma";
const MENSAJE = "La aplicación está en mantenimiento";

/**
 * Fija el estado ANTES de que el bundle monte React. Va como <script> dentro del
 * propio HTML: `addInitScript` no corre con `setContent`, porque no hay navegación.
 */
const montar = async (page: Page, cfg: { activo?: boolean; lento?: boolean; rol?: string; ruta?: string }) => {
  const estado =
    `<script>Object.assign(window, ${JSON.stringify({
      __mantenimiento: cfg.activo ?? false,
      __lento: cfg.lento ?? false,
      __sesion: cfg.rol ? { role: cfg.rol } : null,
      __ruta: cfg.ruta ?? "/",
    })});</script>`;
  await page.setContent(estado + (await html()));
};

test("apagado: la plataforma se ve con normalidad", async ({ page }) => {
  await montar(page, { activo: false });
  await expect(page.getByText(APP)).toBeVisible();
});

test("encendido: un visitante sin sesión queda fuera y ve el mensaje", async ({ page }) => {
  await montar(page, { activo: true });

  await expect(page.getByRole("heading", { name: MENSAJE })).toBeVisible();
  await expect(page.getByText(/Vuelve más tarde/)).toBeVisible();
  await expect(page.getByText(APP)).toHaveCount(0);
});

test("encendido: el usuario con sesión normal tampoco entra", async ({ page }) => {
  await montar(page, { activo: true, rol: "buscador", ruta: "/buscar" });

  await expect(page.getByRole("heading", { name: MENSAJE })).toBeVisible();
  await expect(page.getByText(APP)).toHaveCount(0);
});

test("encendido: el admin entra, para poder apagarlo", async ({ page }) => {
  await montar(page, { activo: true, rol: "admin", ruta: "/admin" });

  await expect(page.getByText(APP)).toBeVisible();
  await expect(page.getByRole("heading", { name: MENSAJE })).toHaveCount(0);
});

test("encendido: /auth/staff sigue abierto para que el admin inicie sesión", async ({ page }) => {
  await montar(page, { activo: true, ruta: "/auth/staff" });

  await expect(page.getByText(APP)).toBeVisible();
});

test("mientras comprueba, no enseña la app ni por un instante", async ({ page }) => {
  await montar(page, { activo: true, lento: true });

  await expect(page.getByText(APP)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: MENSAJE })).toHaveCount(0);
});
