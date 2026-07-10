import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// /buscar debe mostrar 10 avisos por página (5 arriba + 5 abajo) y paginar el
// resto, en vez de volcar todos los resultados de golpe.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// 23 avisos → 3 páginas (10 + 10 + 3).
const LISTINGS = Array.from({ length: 23 }, (_, i) => ({
  id: `l${i + 1}`, title: `Aviso ${i + 1}`, description: "d", price: 100, currency: "PEN",
  category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-10",
  featured: false, advertiser: "A", views: 0,
}));

const searchListings = vi.fn().mockResolvedValue(LISTINGS);
vi.mock("@/lib/listings", () => ({
  searchListings: (...a: unknown[]) => searchListings(...a),
  fetchListingsByOwner: vi.fn().mockResolvedValue([]),
}));

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

describe("SearchPage — paginación de resultados", () => {
  it("muestra solo 10 avisos en la primera página", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(10));
    expect(screen.getByText("Aviso 1")).toBeInTheDocument();
    expect(screen.getByText("Aviso 10")).toBeInTheDocument();
    expect(screen.queryByText("Aviso 11")).not.toBeInTheDocument();
  });

  it("el total de avisos disponibles refleja TODOS, no solo la página", async () => {
    renderPage();
    await screen.findByText(/23 avisos disponibles/i);
  });

  it("'Siguiente' pasa a la página 2 con los avisos 11–20", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(10));

    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    await waitFor(() => expect(screen.getByText("Aviso 11")).toBeInTheDocument());
    expect(screen.getByText("Aviso 20")).toBeInTheDocument();
    expect(screen.queryByText("Aviso 1")).not.toBeInTheDocument();
    expect(cards().length).toBe(10);
  });

  it("la última página muestra el resto (avisos 21–23)", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(10));

    fireEvent.click(screen.getByRole("button", { name: /página 3/i }));

    await waitFor(() => expect(cards().length).toBe(3));
    expect(screen.getByText("Aviso 23")).toBeInTheDocument();
  });

  it("en la primera página 'Anterior' está deshabilitado", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(10));
    expect(screen.getByRole("button", { name: /anterior/i })).toBeDisabled();
  });
});
