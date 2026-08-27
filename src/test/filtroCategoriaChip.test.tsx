import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Home } from "lucide-react";
import { prepararDom } from "./domPolyfills";

/**
 * Los chips de categoria del buscador.
 *
 * EL BUG QUE MOTIVA ESTE ARCHIVO, tal como lo vio el cliente: seleccionaba
 * "Inmuebles" y el mapa filtraba bien; volvia a tocarlo y el mapa pasaba a
 * mostrarlo TODO —correcto, el filtro se habia quitado— pero el chip seguia
 * viendose encendido. Parecia que el boton no respondia.
 *
 * No era el mapa. "Seleccionado" y ":hover" usaban LAS MISMAS clases
 * (border-secondary text-secondary), y en una pantalla tactil el hover se queda
 * pegado despues del toque: el chip apagado se veia identico a uno encendido.
 *
 * Se arregla por los dos lados: el seleccionado va relleno (aqui), y el hover
 * deja de aplicarse donde no hay raton (future.hoverOnlyWhenSupported en
 * tailwind.config.ts).
 */

beforeEach(prepararDom);

const LISTINGS = [
  { id: "l1", title: "Casa", description: "d", price: 100, currency: "PEN",
    category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-07-10",
    featured: false, advertiser: "A", views: 0 },
];

const searchListings = vi.fn().mockResolvedValue(LISTINGS);
vi.mock("@/lib/listings", () => ({
  searchListings: (...a: unknown[]) => searchListings(...a),
  fetchListingsByOwner: vi.fn().mockResolvedValue([]),
  topeAlcanzado: () => false,
  avisosPorPais: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => [
    { id: "inmuebles", name: "Inmuebles", icon: Home },
    { id: "vehiculos", name: "Vehiculos", icon: Home },
  ],
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/ListingsMap", () => ({ ListingsMap: () => null }));
vi.mock("@/components/ListingCard", () => ({
  ListingCard: ({ listing }: { listing: { title: string } }) => <div data-testid="card">{listing.title}</div>,
}));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));
vi.mock("@/lib/savedSearches", () => ({ createSavedSearch: vi.fn(), DUPLICATE_SEARCH_MSG: "dup" }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import SearchPage from "@/pages/SearchPage";

const pintar = (ruta = "/buscar") =>
  render(<MemoryRouter initialEntries={[ruta]}><SearchPage /></MemoryRouter>);

const chip = (nombre: string) => screen.getAllByRole("button", { name: new RegExp(nombre, "i") })[0];

describe("el chip de categoria dice de verdad si esta encendido", () => {
  it("encendido y apagado NO comparten las clases del hover", async () => {
    // El corazon del bug: si el estilo de seleccionado fuera el mismo que el de
    // hover, un hover pegado en el movil seria indistinguible de un filtro
    // activo. El relleno es lo que los separa.
    pintar("/buscar?cat=inmuebles");
    await waitFor(() => expect(chip("Inmuebles").className).toContain("bg-secondary"));

    const apagado = chip("Vehiculos").className;
    expect(apagado).not.toContain("bg-secondary");
    // Y lo que el hover pinta no puede coincidir con lo del seleccionado.
    expect(apagado).toContain("hover:border-secondary");
    expect(chip("Inmuebles").className).not.toContain("hover:border-secondary");
  });

  it("al tocarlo de nuevo se apaga: el chip acompana al filtro", async () => {
    pintar("/buscar?cat=inmuebles");
    await waitFor(() => expect(chip("Inmuebles").className).toContain("bg-secondary"));

    fireEvent.click(chip("Inmuebles"));

    await waitFor(() => expect(chip("Inmuebles").className).not.toContain("bg-secondary"));
  });

  it("lo dice tambien para un lector de pantalla, no solo con color", async () => {
    pintar("/buscar?cat=inmuebles");
    await waitFor(() => expect(chip("Inmuebles")).toHaveAttribute("aria-pressed", "true"));
    expect(chip("Vehiculos")).toHaveAttribute("aria-pressed", "false");
  });

  it("y el filtro llega de verdad a la consulta", async () => {
    pintar("/buscar?cat=inmuebles");
    await waitFor(() =>
      expect(searchListings).toHaveBeenCalledWith(expect.objectContaining({ category: "inmuebles" })));

    fireEvent.click(chip("Inmuebles"));

    // Al apagarlo, la consulta se rehace SIN categoria.
    await waitFor(() => {
      const ultima = searchListings.mock.calls.at(-1)?.[0] as { category?: string };
      expect(ultima.category).toBeFalsy();
    });
  });
});
