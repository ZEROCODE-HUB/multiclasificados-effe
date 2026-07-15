import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// /buscar en ESCRITORIO (web) muestra 20 avisos por página y pagina el resto,
// en vez de volcar todos los resultados de golpe.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// 45 avisos → 3 páginas en web (20 + 20 + 5).
const LISTINGS = Array.from({ length: 45 }, (_, i) => ({
  id: `l${i + 1}`, title: `Aviso ${i + 1}`, description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-10",
  featured: false, advertiser: "A", views: 0,
}));

const searchListings = vi.fn().mockResolvedValue(LISTINGS);
vi.mock("@/lib/listings", () => ({
  searchListings: (...a: unknown[]) => searchListings(...a),
  fetchListingsByOwner: vi.fn().mockResolvedValue([]),
}));

// Escritorio: 20 por página.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

// Children pesados fuera del alcance del test.
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/ListingsMap", () => ({ ListingsMap: () => null }));
vi.mock("@/components/ListingCard", () => ({
  ListingCard: ({ listing }: { listing: { title: string } }) => <div data-testid="card">{listing.title}</div>,
}));

vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));
vi.mock("@/lib/savedSearches", () => ({ createSavedSearch: vi.fn(), DUPLICATE_SEARCH_MSG: "dup" }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import SearchPage from "@/pages/SearchPage";

const renderPage = () =>
  render(<MemoryRouter initialEntries={["/buscar"]}><SearchPage /></MemoryRouter>);

const cards = () => screen.getAllByTestId("card");

describe("SearchPage — paginación en web (20 por página)", () => {
  it("muestra solo 20 avisos en la primera página", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(20));
    expect(screen.getByText("Aviso 1")).toBeInTheDocument();
    expect(screen.getByText("Aviso 20")).toBeInTheDocument();
    expect(screen.queryByText("Aviso 21")).not.toBeInTheDocument();
  });

  it("el total de avisos disponibles refleja TODOS, no solo la página", async () => {
    renderPage();
    await screen.findByText(/45 avisos disponibles/i);
  });

  it("'Siguiente' pasa a la página 2 con los avisos 21–40", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(20));

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    await waitFor(() => expect(screen.getByText("Aviso 21")).toBeInTheDocument());
    expect(screen.getByText("Aviso 40")).toBeInTheDocument();
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
    expect(cards().length).toBe(20);
  });

  it("la última página muestra el resto (avisos 41–45)", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(20));

    fireEvent.click(screen.getByRole("button", { name: /página 3/i }));

    await waitFor(() => expect(cards().length).toBe(5));
    expect(screen.getByText("Aviso 45")).toBeInTheDocument();
  });

  it("en la primera página 'Anterior' está deshabilitado", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(20));
    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
  });

  // Bug de la app: en teléfono salían 2 avisos por fila. La cuadrícula debe
  // arrancar en UNA columna (el 2-col recién desde 'sm').
  it("los avisos van de a uno por fila en la base (móvil)", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(20));
    const grid = cards()[0].parentElement!;
    expect(grid.className).toContain("grid-cols-1");
    // Sin 2 columnas como base (eso solo aplica desde 'sm:').
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });
});
