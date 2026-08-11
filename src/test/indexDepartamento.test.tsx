import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * La portada entera respeta el departamento elegido.
 *
 * Antes solo lo hacía la sección "Avisos en …": las dos rejillas grandes y el
 * mapa traían avisos de todo el país, así que a alguien de Lima se le enseñaba
 * un destacado de Piura al que no puede ir. Y como las rejillas salen ahora de
 * la misma lista que esa sección, hay que comprobar también que no repiten los
 * primeros cuatro avisos justo debajo de donde ya salían.
 */

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!window.IntersectionObserver) {
    (window as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  localStorage.clear();
  llamadas.length = 0;
});

/** Registro de qué se le pidió al servidor y con qué filtros. */
const llamadas: Array<{ fn: "fetchListings" | "searchListings"; department?: string; limit?: number }> = [];

const aviso = (n: number, dep: string) => ({
  id: `${n}`, title: `Aviso ${n}`, price: 100, currency: "PEN", location: "Sitio",
  category: "vehiculos", imageUrl: null, lat: null, lng: null, department: dep,
  featured: false, urgent: false, views: 0, advertiser: "A",
});

const NACIONALES = Array.from({ length: 24 }, (_, i) => aviso(i + 100, "20"));
const DE_LIMA = Array.from({ length: 24 }, (_, i) => aviso(i + 1, "15"));

vi.mock("@/lib/listings", () => ({
  fetchListings: async (o?: { limit?: number }) => {
    llamadas.push({ fn: "fetchListings", limit: o?.limit });
    return NACIONALES;
  },
  searchListings: async (f?: { department?: string; limit?: number }) => {
    llamadas.push({ fn: "searchListings", department: f?.department, limit: f?.limit });
    return DE_LIMA;
  },
}));
vi.mock("@/lib/stats", () => ({
  fetchPlatformStats: async () => null,
  fetchCategoryCounts: async () => ({}),
}));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/LibroReclamaciones", () => ({ LibroReclamaciones: () => null }));
vi.mock("@/components/ListingCard", () => ({
  ListingCard: ({ listing }: { listing: { title: string } }) => (
    <div data-testid="card">{listing.title}</div>
  ),
}));

import Index from "@/pages/Index";

const renderHome = () => render(<MemoryRouter><Index /></MemoryRouter>);
const titulos = () => screen.getAllByTestId("card").map((n) => n.textContent);

describe("La portada con un departamento elegido", () => {
  beforeEach(() => { localStorage.setItem("effe:departamento", "15"); });

  it("pide al servidor solo los avisos de ese departamento", async () => {
    renderHome();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    expect(llamadas.every((l) => l.fn === "searchListings")).toBe(true);
    expect(llamadas[0].department).toBe("15");
  });

  it("no enseña ni un aviso de otro departamento", async () => {
    renderHome();
    await waitFor(() => expect(screen.getAllByTestId("card").length).toBeGreaterThan(0));
    // Los nacionales son del 100 en adelante; los de Lima, del 1 al 24.
    expect(titulos().some((t) => Number(t?.replace("Aviso ", "")) >= 100)).toBe(false);
  });

  it("no repite en las rejillas los avisos de la sección del departamento", async () => {
    renderHome();
    await waitFor(() => expect(screen.getAllByTestId("card").length).toBeGreaterThan(0));
    const vistos = titulos();
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  it("lo dice en los rótulos, para que no parezca que eso es todo el país", async () => {
    renderHome();
    await waitFor(() => expect(screen.getAllByTestId("card").length).toBeGreaterThan(0));
    expect(screen.getByText(/Destacados en Lima y Callao/i)).toBeInTheDocument();
    expect(screen.getByText(/Recién publicados en Lima y Callao/i)).toBeInTheDocument();
  });

  it('"Ver todo el catálogo" mantiene el departamento', async () => {
    renderHome();
    await waitFor(() => expect(screen.getAllByTestId("card").length).toBeGreaterThan(0));
    expect(screen.getByRole("link", { name: /Ver todo el catálogo/i }))
      .toHaveAttribute("href", "/buscar?dep=15");
  });
});

describe("La portada sin departamento elegido", () => {
  it("sigue siendo la de todo el país", async () => {
    renderHome();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    expect(llamadas.every((l) => l.fn === "fetchListings")).toBe(true);
  });

  it("no reserva sitio para la sección del departamento: la rejilla empieza en el primero", async () => {
    renderHome();
    await waitFor(() => expect(screen.getAllByTestId("card").length).toBeGreaterThan(0));
    expect(titulos()[0]).toBe("Aviso 100");
  });
});
