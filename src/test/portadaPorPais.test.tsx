import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * La portada cuando la visita NO viene del Perú.
 *
 * EL PROBLEMA
 *
 * La portada solo sabía de los 25 departamentos del INEI. A alguien que
 * entrase desde Rumanía —y hay 4 avisos rumanos publicados— le preguntaba
 * "¿Dónde estás?" y le ofrecía un desplegable de departamentos peruanos: 25
 * sitios donde no está.
 *
 * Y había una trampa peor, escondida en `searchListings`: si no se le pasa
 * país filtra por "PE" de oficio. Así que en cuanto se elegía departamento,
 * los avisos de fuera desaparecían sin que nadie lo hubiera pedido.
 *
 * El buscador ya sabía de países (los deduce por IP y tiene selector); la
 * portada no. Esa era la brecha real, más que los avisos concretos.
 */

const llamadas: Array<{ fn: string; country?: string; department?: string }> = [];
/** Para probar el caso "este país no tiene nada publicado". */
let vacio = false;

beforeEach(() => {
  prepararDom();
  localStorage.clear();
  llamadas.length = 0;
  vacio = false;
});

const aviso = (n: number) => ({
  id: `${n}`, title: `Aviso ${n}`, price: 100, currency: "PEN", location: "Bucarest",
  category: "inmuebles", imageUrl: null, lat: null, lng: null,
  featured: false, urgent: false, views: 0, advertiser: "A",
});

const RUMANOS = Array.from({ length: 6 }, (_, i) => aviso(i + 1));

vi.mock("@/lib/listings", () => ({
  fetchListings: async () => {
    llamadas.push({ fn: "fetchListings" });
    return vacio ? [] : RUMANOS;
  },
  searchListings: async (f?: { country?: string; department?: string }) => {
    llamadas.push({ fn: "searchListings", country: f?.country, department: f?.department });
    return vacio ? [] : RUMANOS;
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

const pintar = () => render(<MemoryRouter><Index /></MemoryRouter>);

describe("desde fuera del Perú", () => {
  beforeEach(() => { localStorage.setItem("effe:pais", "RO"); });

  it("no pide el departamento: ofrecía 25 sitios donde la persona no está", async () => {
    pintar();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    expect(screen.queryByText(/Dónde estás/i)).toBeNull();
    expect(screen.queryByText(/Elige tu departamento/i)).toBeNull();
  });

  it("la sección se titula con el país", async () => {
    pintar();
    await waitFor(() => expect(screen.getByText(/Avisos en Rumanía/i)).toBeInTheDocument());
  });

  it("y pide al servidor los avisos DE ESE PAÍS", async () => {
    // Lo importante no es que llame, sino que pase `country`: sin él,
    // searchListings filtra por "PE" de oficio y devolvería una lista vacía.
    pintar();
    await waitFor(() => expect(llamadas.some((l) => l.country === "RO")).toBe(true));
    expect(llamadas.every((l) => l.department === undefined)).toBe(true);
  });

  it("el enlace lleva al buscador filtrado por el país", async () => {
    pintar();
    await waitFor(() => expect(screen.getAllByTestId("card").length).toBeGreaterThan(0));
    expect(screen.getByRole("link", { name: /Ver todos/i }))
      .toHaveAttribute("href", "/buscar?pais=RO");
  });
});

describe("desde el Perú no cambia nada", () => {
  beforeEach(() => { localStorage.setItem("effe:pais", "PE"); });

  it("sigue preguntando el departamento", async () => {
    pintar();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    expect(screen.getByText(/Dónde estás/i)).toBeInTheDocument();
  });

  it("y no mete un filtro de país por su cuenta", async () => {
    pintar();
    await waitFor(() => expect(llamadas.length).toBeGreaterThan(0));
    expect(llamadas.every((l) => l.country === undefined)).toBe(true);
  });
});

describe("si el país no tiene ni un aviso", () => {
  beforeEach(() => {
    localStorage.setItem("effe:pais", "RO");
    vacio = true;
  });

  it("lo dice con el nombre del país", async () => {
    pintar();
    await waitFor(() =>
      expect(screen.getByText(/no hay avisos publicados en Rumanía/i)).toBeInTheDocument());
  });

  it("y la salida es 'todos los países', que no devuelve al mismo vacío", async () => {
    // Sin el `?pais=todos`, el enlace llevaría a un buscador que arranca
    // filtrando por el país deducido: exactamente la lista vacía de la que se
    // está huyendo. El botón parecería roto.
    pintar();
    await waitFor(() => expect(screen.getByRole("link", { name: /todos los países/i })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /todos los países/i }))
      .toHaveAttribute("href", "/buscar?pais=todos");
  });
});
