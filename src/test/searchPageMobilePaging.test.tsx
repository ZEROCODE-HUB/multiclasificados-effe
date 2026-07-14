import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// /buscar en MÓVIL (pantalla < 768px, incluido el APK) pagina de 10 en 10.
// Antes el APK mostraba la lista continua; ahora también pagina.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// 23 avisos → 3 páginas en móvil (10 + 10 + 3). vi.mock se iza al tope, así que
// LISTINGS debe existir antes vía vi.hoisted.
const { LISTINGS } = vi.hoisted(() => ({
  LISTINGS: Array.from({ length: 23 }, (_, i) => ({
    id: `l${i + 1}`, title: `Aviso ${i + 1}`, description: "d", price: 100, currency: "PEN",
    category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-10",
    featured: false, advertiser: "A", views: 0,
  })),
}));

vi.mock("@/lib/listings", () => ({
  searchListings: vi.fn().mockResolvedValue(LISTINGS),
  fetchListingsByOwner: vi.fn().mockResolvedValue([]),
}));

// Móvil: 10 por página.
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));

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

describe("SearchPage — paginación en móvil (10 por página)", () => {
  it("muestra solo 10 avisos en la primera página y controles de paginación", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(10));
    expect(screen.getByText("Aviso 10")).toBeInTheDocument();
    expect(screen.queryByText("Aviso 11")).not.toBeInTheDocument();
    // A diferencia de antes (APK sin paginar), ahora sí aparecen los controles.
    expect(screen.getByRole("navigation", { name: /paginación/i })).toBeInTheDocument();
  });

  it("la última página muestra el resto (avisos 21–23)", async () => {
    renderPage();
    await waitFor(() => expect(cards().length).toBe(10));

    fireEvent.click(screen.getByRole("button", { name: /página 3/i }));

    await waitFor(() => expect(cards().length).toBe(3));
    expect(screen.getByText("Aviso 23")).toBeInTheDocument();
  });
});
