import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Qué pasa al elegir una zona en el buscador.
//
// La duda de producto era: "si elijo un distrito de Lima, ¿debería ver también
// los de Lima?". La respuesta que implementa esto es que NO se recorta nada por
// distrito ni por departamento: se ordena del más cercano al más lejano. Primero
// el distrito, luego los vecinos, luego el resto de la ciudad y después el país.
// Sin cortes ni cifras de kilómetros que el usuario tenga que adivinar.

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  window.matchMedia ??= (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  buscarSpy.mockClear();
});

const buscarSpy = vi.fn().mockResolvedValue([]);

vi.mock("@/lib/listings", () => ({
  searchListings: (...a: unknown[]) => buscarSpy(...a),
  fetchListingsByOwner: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/ListingsMap", () => ({ ListingsMap: () => null }));
vi.mock("@/components/ListingCard", () => ({ ListingCard: () => null }));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));
vi.mock("@/lib/savedSearches", () => ({ createSavedSearch: vi.fn(), DUPLICATE_SEARCH_MSG: "dup" }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import SearchPage from "@/pages/SearchPage";

const montar = (url = "/buscar") =>
  render(<MemoryRouter initialEntries={[url]}><SearchPage /></MemoryRouter>);

/** Argumentos de la última búsqueda lanzada al servidor. */
const ultimaBusqueda = () => buscarSpy.mock.calls.at(-1)?.[0] ?? {};

describe("buscador — al conocer la zona", () => {
  it("NO recorta por kilómetros: manda el punto pero nunca un radio", async () => {
    localStorage.setItem("effe:zona", "150122"); // Miraflores
    montar();

    await waitFor(() => expect(buscarSpy).toHaveBeenCalled());
    const f = ultimaBusqueda();
    expect(f.lat).toBeCloseTo(-12.12167, 3);
    // Esto es lo que garantiza que no se esconde nada: sin radio, el servidor
    // devuelve todo el país y solo cambia el orden.
    expect(f.radiusKm).toBeUndefined();
  });

  it("ordena por cercanía en cuanto se sabe de dónde es el usuario", async () => {
    localStorage.setItem("effe:zona", "150122");
    montar();

    await waitFor(() => expect(ultimaBusqueda().sort).toBe("distance"));
  });

  it("sin zona, el orden sigue siendo por recientes", async () => {
    montar();
    await waitFor(() => expect(buscarSpy).toHaveBeenCalled());
    expect(ultimaBusqueda().sort).toBe("recent");
    expect(ultimaBusqueda().lat).toBeUndefined();
  });

  it("ya no existe el selector de kilómetros", async () => {
    localStorage.setItem("effe:zona", "150122");
    montar();
    await waitFor(() => expect(buscarSpy).toHaveBeenCalled());

    expect(screen.queryByText(/km a la redonda/i)).toBeNull();
    // En su lugar se explica qué va a ver.
    expect(screen.getByText(/verás primero lo más cercano/i)).toBeTruthy();
  });

  it("respeta el orden que el usuario haya pedido en la URL", async () => {
    localStorage.setItem("effe:zona", "150122");
    montar("/buscar?sort=price_asc");

    await waitFor(() => expect(buscarSpy).toHaveBeenCalled());
    expect(ultimaBusqueda().sort).toBe("price_asc");
    // Aun así se manda el punto: el servidor lo usa para la prioridad por zona.
    expect(ultimaBusqueda().lat).toBeCloseTo(-12.12167, 3);
  });

  it("una zona en la URL manda sobre la guardada (enlace compartido)", async () => {
    localStorage.setItem("effe:zona", "150122"); // Miraflores
    montar("/buscar?z=040101"); // Arequipa

    await waitFor(() => expect(buscarSpy).toHaveBeenCalled());
    // Se comprueba que el punto es el de Arequipa y no el de Lima, sin atarse a
    // la cifra exacta del catálogo (que puede afinarse al regenerarlo).
    const { lat, lng } = ultimaBusqueda();
    expect(lat).toBeLessThan(-16);
    expect(lat).toBeGreaterThan(-16.8);
    expect(lng).toBeLessThan(-71);
    expect(lng).toBeGreaterThan(-72);
  });
});
