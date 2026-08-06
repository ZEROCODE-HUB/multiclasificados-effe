import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// MOB-08: "Usar mi ubicación" se quedaba en "Ubicando…" para siempre en iOS.
//
// La causa de fondo es que faltaba NSLocationWhenInUseUsageDescription en el
// Info.plist (se inyecta ahora en codemagic.yaml): sin esa clave iOS no puede
// pedir el permiso y getCurrentPosition no llama a NINGUNO de sus dos callbacks
// —tampoco al de error, pese al `timeout` de la API. Aquí se fija la segunda
// mitad del arreglo: aunque el sistema no conteste nunca, la pantalla se destraba.

// Lo que jsdom no trae y los componentes de Radix dan por hecho.
beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  window.matchMedia ??= (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

vi.mock("@/lib/listings", () => ({
  searchListings: vi.fn().mockResolvedValue([]),
  fetchListingsByOwner: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/ListingsMap", () => ({ ListingsMap: () => null }));
vi.mock("@/components/ListingCard", () => ({ ListingCard: () => null }));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));
vi.mock("@/lib/savedSearches", () => ({ createSavedSearch: vi.fn(), DUPLICATE_SEARCH_MSG: "dup" }));

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toastSpy(...a) }));

import SearchPage from "@/pages/SearchPage";

// Geolocalización que acepta la llamada y no responde jamás: es lo que ocurre
// en iOS sin el permiso declarado.
const getCurrentPosition = vi.fn();

const renderPage = () =>
  render(<MemoryRouter initialEntries={["/buscar"]}><SearchPage /></MemoryRouter>);

const botonUbicacion = () => screen.getByRole("button", { name: /ubicando|usar mi ubicación/i });

beforeEach(() => {
  toastSpy.mockClear();
  getCurrentPosition.mockReset();
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
});

afterEach(() => vi.useRealTimers());

describe("SearchPage — «Usar mi ubicación»", () => {
  it("no se queda cargando para siempre si el sistema nunca responde", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage();

    fireEvent.click(botonUbicacion());
    expect(getCurrentPosition).toHaveBeenCalled();
    await waitFor(() => expect(botonUbicacion().textContent).toMatch(/ubicando/i));

    // Pasa el plazo sin una sola respuesta del sistema.
    await act(async () => { await vi.advanceTimersByTimeAsync(11000); });

    expect(botonUbicacion().textContent).not.toMatch(/ubicando/i);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/no se pudo obtener tu ubicación/i) }),
    );
  });

  it("si el sistema responde a tiempo, guarda la posición y no muestra error", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getCurrentPosition.mockImplementation((ok: PositionCallback) =>
      ok({ coords: { latitude: -12.05, longitude: -77.04 } } as GeolocationPosition),
    );
    renderPage();

    fireEvent.click(botonUbicacion());
    // Con la posición ya obtenida, el botón deja paso al filtro por cercanía.
    await waitFor(() => expect(screen.getByText(/ordenado por cercanía/i)).toBeTruthy());

    // Y el corte de seguridad no salta después a destiempo.
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(toastSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/no se pudo obtener/i) }),
    );
  });
});
