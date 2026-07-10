import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// La paginación de /buscar es SOLO para la web. En la app (APK) se mantiene la
// lista continua de siempre: todos los avisos, sin controles de página.

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// Simula que corremos dentro del APK.
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" } }));

// vi.mock se iza al tope; LISTINGS debe existir antes vía vi.hoisted.
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

describe("SearchPage en la app (APK) — sin paginación", () => {
  it("muestra TODOS los avisos y no pinta controles de paginación", async () => {
    render(<MemoryRouter initialEntries={["/buscar"]}><SearchPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getAllByTestId("card").length).toBe(23));
    expect(screen.queryByRole("navigation", { name: /paginación/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /siguiente/i })).not.toBeInTheDocument();
  });
});
