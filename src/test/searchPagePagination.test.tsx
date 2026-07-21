import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// /buscar en ESCRITORIO (web) muestra 18 avisos por página (6 por fila × 3 filas)
// y pagina el resto, en vez de volcar todos los resultados de golpe.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// 45 avisos → 3 páginas en web (18 + 18 + 9).
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

// Escritorio: 18 por página.
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

describe("SearchPage — paginación en web (18 por página)", () => {
  it("muestra solo 18 avisos en la primera página", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(18));
    expect(screen.getByText("Aviso 1")).toBeInTheDocument();
    expect(screen.getByText("Aviso 18")).toBeInTheDocument();
    expect(screen.queryByText("Aviso 19")).not.toBeInTheDocument();
  });

  it("el total de avisos disponibles refleja TODOS, no solo la página", async () => {
    renderPage();
    await screen.findByText(/45 avisos disponibles/i);
  });

  it("'Siguiente' pasa a la página 2 con los avisos 19–36", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(18));

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    await waitFor(() => expect(screen.getByText("Aviso 19")).toBeInTheDocument());
    expect(screen.getByText("Aviso 36")).toBeInTheDocument();
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
    expect(cards().length).toBe(18);
  });

  it("la última página muestra el resto (avisos 37–45)", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(18));

    fireEvent.click(screen.getByRole("button", { name: /página 3/i }));

    await waitFor(() => expect(cards().length).toBe(9));
    expect(screen.getByText("Aviso 45")).toBeInTheDocument();
  });

  it("en la primera página 'Anterior' está deshabilitado", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(18));
    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
  });

  // Densidad (UI): en móvil se muestran 2 avisos por fila (antes 1) para caber
  // más por pantalla. Desde 'sm' sube a 3, y en web (xl) son 6 por fila.
  it("los avisos van de a dos por fila en la base (móvil)", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(18));
    const grid = cards()[0].parentElement!;
    expect(grid.className).toMatch(/(^|\s)grid-cols-2(\s|$)/);
    expect(grid.className).toContain("sm:grid-cols-3");
    expect(grid.className).toContain("xl:grid-cols-6");
  });
});
