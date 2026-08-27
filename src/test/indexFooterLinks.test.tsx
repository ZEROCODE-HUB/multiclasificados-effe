import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

// El pie de la portada llevaba a sitios que no existían o no aportaban:
// "Acerca de" era un ancla a la propia página, "Contacto" abría el gestor de
// correo (los datos ya están en la columna de al lado) y "Planes Pro" mandaba al
// login. Los dos enlaces legales, además, abrían el mismo diálogo (IT3-010).

beforeEach(() => {
  prepararDom();
  // El país se fija: la portada lo deduce de la zona horaria del equipo, y sin
  // esto el pie se probaría contra una portada distinta según dónde se ejecute.
  localStorage.setItem("effe:pais", "PE");
});

vi.mock("@/lib/listings", () => ({
  fetchListings: async () => [],
  // La portada usa una u otra según el país desde el que se mire; aquí se
  // prueba el pie, así que las dos devuelven lo mismo.
  searchListings: async () => [],
}));
vi.mock("@/lib/stats", () => ({
  fetchPlatformStats: async () => null,
  fetchCategoryCounts: async () => ({}),
}));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/LibroReclamaciones", () => ({ LibroReclamaciones: () => null }));

import Index from "@/pages/Index";

const renderHome = () => render(<MemoryRouter><Index /></MemoryRouter>);

describe("Footer de la portada", () => {
  it("ya no ofrece Planes Pro ni Acerca de", () => {
    renderHome();
    expect(screen.queryByRole("link", { name: /Planes Pro/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /Acerca de/i })).toBeNull();
  });

  it('"Contacto" solo queda como título de columna, sin enlace de correo', () => {
    renderHome();
    // El texto sigue existiendo (encabezado de la columna de datos), pero no
    // como enlace: por eso se acota a los enlaces y no al texto suelto.
    expect(screen.queryByRole("link", { name: "Contacto" })).toBeNull();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  // Auditoría de agosto, hallazgos 13 y 14: el pie enseñaba datos de relleno.
  it("el correo de contacto es el de la empresa, no uno inventado", () => {
    const { container } = renderHome();
    const footer = container.querySelector("footer")!;
    expect(within(footer).getByText("info@coleffe.com")).toBeInTheDocument();
    // El anterior no existe: quien escribiera ahí no llegaba a nadie.
    expect(footer.textContent).not.toContain("effemulticlasificados.pe");
  });

  it("no queda ningún teléfono de relleno", () => {
    const { container } = renderHome();
    const footer = container.querySelector("footer")!;
    expect(footer.textContent).not.toMatch(/234\s*5678/);
  });

  it("deja un único acceso a los términos", () => {
    const { container } = renderHome();
    const footer = container.querySelector("footer")!;
    expect(within(footer).getAllByRole("button", { name: /Términos y condiciones/i })).toHaveLength(1);
    expect(within(footer).queryByRole("button", { name: /Política de privacidad/i })).toBeNull();
  });

  it("conserva lo que sí lleva a alguna parte", () => {
    const { container } = renderHome();
    const footer = container.querySelector("footer")!;
    expect(within(footer).getByRole("link", { name: /Explorar avisos/i })).toHaveAttribute("href", "/buscar");
    expect(within(footer).getByRole("link", { name: /Iniciar sesión/i })).toHaveAttribute("href", "/auth");
  });
});
