import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

/**
 * La plataforma es SOLO tema claro.
 *
 * El problema no era nuestro tema oscuro —nadie añadía nunca la clase `.dark`—
 * sino que sin declarar `color-scheme` el navegador pinta de oscuro sus propios
 * controles (inputs, selects, scrollbars, autocompletado) cuando el sistema está
 * en modo oscuro. Se notaba en el panel de admin, que es casi todo formularios.
 */

const raiz = path.resolve(__dirname, "../..");
const css = fs.readFileSync(path.join(raiz, "src/index.css"), "utf8");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");

import { Toaster, toast } from "@/components/ui/sonner";

describe("color-scheme: el navegador tiene que saber que somos claros", () => {
  it("index.css lo declara en :root", () => {
    expect(css).toMatch(/:root\s*{[^}]*color-scheme:\s*light/s);
  });

  it("index.html lo declara en el <head>, antes de que se pinte nada", () => {
    expect(html).toMatch(/<meta\s+name="color-scheme"\s+content="light"/);
  });
});

describe("no queda tema oscuro", () => {
  it("no hay una paleta .dark en index.css", () => {
    expect(css).not.toMatch(/^\s*\.dark\s*{/m);
  });

  it("nadie declara variables de color oscuras", () => {
    // La paleta oscura arrancaba con este fondo.
    expect(css).not.toContain("220 30% 8%");
  });
});

describe("los toasts", () => {
  it("se pintan en claro, no siguen al sistema operativo", async () => {
    render(<Toaster />);
    // Sonner no monta el contenedor hasta que hay algo que mostrar.
    toast("Reporte exportado");

    await waitFor(() => {
      const toaster = document.body.querySelector("[data-sonner-toaster]");
      expect(toaster).toHaveAttribute("data-theme", "light");
    });
  });

  it("ya no importan next-themes, que sin proveedor devolvía 'system'", () => {
    const fuente = fs.readFileSync(path.join(raiz, "src/components/ui/sonner.tsx"), "utf8");
    expect(fuente).not.toMatch(/^import .*next-themes/m);
    expect(fuente).toContain('theme="light"');
  });
});
