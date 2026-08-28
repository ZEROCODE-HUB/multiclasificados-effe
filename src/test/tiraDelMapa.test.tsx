import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * La tira de avisos de la vista Mapa.
 *
 * Sustituye a la ventanita que salía sobre el pin, que no había forma de
 * colocar bien: la dimensiona Google y con el panel a 45vh nunca cabía.
 *
 * Aquí el pin solo dice CUÁL se eligió y la tira hace el resto: se queda con
 * ese aviso y ofrece volver a todos.
 */

beforeEach(prepararDom);

// `vi.hoisted`: los `vi.mock` se elevan al principio del archivo, así que una
// constante normal declarada aquí arriba todavía no existe cuando el factory
// del mock la usa.
const { LISTINGS } = vi.hoisted(() => ({
  LISTINGS: Array.from({ length: 6 }, (_, i) => ({
    id: `l${i + 1}`, title: `Aviso ${i + 1}`, description: "d", price: 100, currency: "PEN",
    category: "inmuebles", location: "Lima", imageUrl: "x", date: "2026-08-01",
    featured: false, advertiser: "A", views: 0, lat: -12 - i, lng: -77,
  })),
}));

vi.mock("@/lib/listings", () => ({
  searchListings: vi.fn().mockResolvedValue(LISTINGS),
  fetchListingsByOwner: vi.fn().mockResolvedValue([]),
  topeAlcanzado: () => false,
  avisosPorPais: vi.fn().mockResolvedValue({}),
}));

// El mapa de verdad necesita el SDK de Google; aquí solo hace falta poder
// disparar su `onActive`, que es lo que hace un pin al pulsarlo.
vi.mock("@/components/ListingsMap", () => ({
  ListingsMap: ({ onActive }: { onActive: (id: string) => void }) => (
    <button data-testid="pin" onClick={() => onActive("l3")}>pin de l3</button>
  ),
}));

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/ListingCard", () => ({
  ListingCard: ({ listing }: { listing: { title: string } }) => <div data-testid="card">{listing.title}</div>,
}));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => [] }));
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));
vi.mock("@/lib/savedSearches", () => ({ createSavedSearch: vi.fn(), DUPLICATE_SEARCH_MSG: "dup" }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import SearchPage from "@/pages/SearchPage";

const pintar = () =>
  render(<MemoryRouter initialEntries={["/buscar?view=map"]}><SearchPage /></MemoryRouter>);

const tarjetas = () => screen.queryAllByTestId("card");

describe("pulsar un pin deja solo ese aviso", () => {
  it("de seis pasa a uno", async () => {
    pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));

    fireEvent.click(screen.getByTestId("pin"));

    await waitFor(() => expect(tarjetas().length).toBe(1));
    expect(tarjetas()[0].textContent).toBe("Aviso 3");
  });

  it("y aparece la salida para volver a verlos todos", async () => {
    pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    // Sin pin elegido no hay nada que quitar, así que el botón no está.
    expect(screen.queryByRole("button", { name: /ver todos/i })).toBeNull();

    fireEvent.click(screen.getByTestId("pin"));
    await waitFor(() => expect(screen.getByRole("button", { name: /ver todos/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /ver todos/i }));
    await waitFor(() => expect(tarjetas().length).toBe(6));
  });

  it("el conteo sigue diciendo el TOTAL, no uno", async () => {
    // Si dijera "1 aviso" mientras se mira uno solo, parecería que el mapa se
    // ha quedado sin nada.
    pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    fireEvent.click(screen.getByTestId("pin"));

    await waitFor(() => expect(tarjetas().length).toBe(1));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/6\s*avisos/);
  });
});

describe("pasar el ratón por una tarjeta NO filtra", () => {
  it("solo el pin deja uno; el ratón únicamente resalta", async () => {
    // Filtrar la lista con solo pasar por encima sería insufrible: la lista
    // cambiaría bajo el cursor mientras se recorre.
    pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));

    fireEvent.mouseEnter(tarjetas()[1]);

    expect(tarjetas().length).toBe(6);
    expect(screen.queryByRole("button", { name: /ver todos/i })).toBeNull();
  });
});
