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

/**
 * LA VISTA MAPA CABE EN PANTALLA Y NO SE DESPLAZA.
 *
 * Tener que bajar para ver los avisos en una pantalla que ya es un mapa es lo
 * peor de los dos mundos: ni se ve bien el mapa ni se llega a la lista. Para
 * que quepa hay que quitarle alto a todo lo demás, y eso son decisiones
 * concretas, no un ajuste de CSS suelto. Son las que fijan estas pruebas.
 */
describe("la vista mapa cabe entera", () => {
  it("la página no hace scroll: alto fijo y desbordamiento oculto", async () => {
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    const raiz = container.firstChild as HTMLElement;
    expect(raiz.className).toContain("h-[100dvh]");
    expect(raiz.className).toContain("overflow-hidden");
    // `dvh` y no `vh`: en el móvil la barra del navegador aparece y desaparece,
    // y con `vh` la tira quedaba cortada por abajo al mover el mapa.
    expect(raiz.className).not.toContain("h-[100vh]");
  });

  it("el mapa se queda con el alto que sobre, sin un 45vh fijo", async () => {
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    // Cuanto menos ocupen la búsqueda y la tira, más mapa se ve.
    expect(container.innerHTML).not.toContain("h-[45vh]");
  });

  it("la fila de categorías se esconde: ya están dentro del botón Filtros", async () => {
    // En el mapa el espacio vertical es lo único escaso, y esa fila repetía
    // algo alcanzable de otra forma. Se comprueba por la clase y no por el rol
    // porque sigue en el DOM: la esconde el CSS según el ancho.
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    const fila = container.querySelector('[data-fila="categorias"]') as HTMLElement;
    expect(fila).toBeTruthy();
    expect(fila.className).toContain("hidden");
  });

  it("y el botón Filtros sigue ahí, que es donde viven ahora", async () => {
    // Hay dos en el documento (uno por tamaño de pantalla) desde antes de esto;
    // lo que importa es que no desaparezcan al ocultar las categorías.
    pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    expect(screen.getAllByRole("button", { name: /filtros/i }).length).toBeGreaterThan(0);
  });

  it("hay UN solo encabezado de página, no uno por tamaño de pantalla", async () => {
    // El conteo se pinta flotando sobre el mapa; con un <h1> en cada variante
    // visual habría dos en el documento, o ninguno alcanzable según el ancho.
    pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
