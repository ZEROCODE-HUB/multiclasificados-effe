import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// "Cerca de ti" en la portada. Es donde más vale la pena: es lo primero que se
// abre. La zona se pregunta AQUÍ si aún no se sabe, y se reutiliza la que ya
// eligió el usuario en el buscador (y viceversa).
//
// Importante: la portada NO pide permiso de ubicación. Pedirlo nada más entrar
// es justo lo que se corrigió en el arranque de la app (MOB-03 de la iter. 4).

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

const aviso = (id: string, title: string) => ({
  id, title, description: "d", price: 100, currency: "PEN", category: "inmuebles",
  location: "Miraflores, Lima", imageUrl: "x", date: "2026-08-01", featured: false,
  advertiser: "A", views: 0,
});

const buscarSpy = vi.fn().mockResolvedValue([aviso("c1", "Aviso cercano")]);

vi.mock("@/lib/listings", () => ({
  fetchListings: vi.fn().mockResolvedValue([]),
  searchListings: (...a: unknown[]) => buscarSpy(...a),
}));
vi.mock("@/lib/stats", () => ({
  fetchPlatformStats: vi.fn().mockResolvedValue(null),
  fetchCategoryCounts: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/CategoryGrid", () => ({ CategoryGrid: () => null }));
vi.mock("@/components/HeroSearch", () => ({ HeroSearch: () => null }));
vi.mock("@/components/LibroReclamaciones", () => ({ LibroReclamaciones: () => null }));
vi.mock("@/components/ListingCard", () => ({
  ListingCard: ({ listing }: { listing: { title: string } }) => <div data-testid="cerca">{listing.title}</div>,
}));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/hooks/useFittingCount", () => ({ useFittingCount: () => ({ ref: { current: null }, count: 4 }) }));

import Index from "@/pages/Index";

const montar = () => render(<MemoryRouter><Index /></MemoryRouter>);

describe("portada — Cerca de ti", () => {
  it("sin zona guardada, la pide en vez de dejar el hueco vacío", async () => {
    montar();
    expect(await screen.findByText(/qué hay cerca de ti/i)).toBeTruthy();
    expect(screen.getByText(/dinos tu distrito/i)).toBeTruthy();
    // Y no se ha buscado nada todavía: no hay desde dónde medir.
    expect(buscarSpy).not.toHaveBeenCalled();
  });

  it("no pide el permiso de ubicación al entrar", () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    montar();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("elegir la zona ahí mismo trae los avisos cercanos", async () => {
    montar();
    fireEvent.click(await screen.findByRole("combobox"));
    fireEvent.change(await screen.findByPlaceholderText(/busca tu distrito/i), {
      target: { value: "miraflores" },
    });
    fireEvent.click(await screen.findByText("Miraflores, Lima"));

    await waitFor(() => expect(screen.getByText("Aviso cercano")).toBeTruthy());
    // Se pide ordenado por cercanía y desde el punto de la zona.
    expect(buscarSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sort: "distance", lat: expect.any(Number), lng: expect.any(Number) }),
    );
    expect(screen.getByText(/lo más cercano en miraflores/i)).toBeTruthy();
  });

  it("recuerda la zona para la próxima visita y la comparte con el buscador", async () => {
    montar();
    fireEvent.click(await screen.findByRole("combobox"));
    fireEvent.change(await screen.findByPlaceholderText(/busca tu distrito/i), {
      target: { value: "miraflores" },
    });
    fireEvent.click(await screen.findByText("Miraflores, Lima"));

    await waitFor(() => expect(localStorage.getItem("effe:zona")).toBe("150122"));
  });

  it("con la zona ya guardada, muestra los cercanos sin preguntar nada", async () => {
    localStorage.setItem("effe:zona", "150122");
    montar();
    expect(await screen.findByText("Aviso cercano")).toBeTruthy();
    expect(screen.queryByText(/dinos tu distrito/i)).toBeNull();
  });

  it("si no hay avisos cerca, lo dice y ofrece ver los del país", async () => {
    buscarSpy.mockResolvedValueOnce([]);
    localStorage.setItem("effe:zona", "150122");
    montar();
    expect(await screen.findByText(/todavía no hay avisos publicados cerca/i)).toBeTruthy();
  });

  it("se puede cambiar de zona y vuelve a preguntar", async () => {
    localStorage.setItem("effe:zona", "150122");
    montar();
    fireEvent.click(await screen.findByText(/cambiar mi zona/i));
    expect(await screen.findByText(/dinos tu distrito/i)).toBeTruthy();
    expect(localStorage.getItem("effe:zona")).toBeNull();
  });
});
