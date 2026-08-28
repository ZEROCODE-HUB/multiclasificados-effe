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
  // El mock ARRASTRA `className`: es lo que le da a la tarjeta el estirón que
  // la iguala con las del listado, y sin esto el test no podría verlo.
  ListingCard: ({ listing, className }: { listing: { title: string }; className?: string }) => (
    <div data-testid="card" className={className}>{listing.title}</div>
  ),
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

/**
 * NADA MÁS QUE LA TIRA SE MUEVE.
 *
 * El sintoma: pulsas un pin, el mapa lo centra bien… y un instante despues el
 * pin da un salto corto hacia atras y vuelve a colocarse. Parecia cosa del
 * mapa y era de aqui: llevar la tarjeta a la vista con `scrollIntoView`
 * desplaza TODOS los ancestros que puedan desplazarse, no solo el que uno
 * tiene en mente — y uno de ellos contiene el mapa.
 *
 * Se arregla tocando el scroll del propio contenedor, que no puede afectar a
 * nada de fuera. Esta prueba lo fija: si alguien vuelve a `scrollIntoView`, el
 * espia salta.
 */
describe("llevar la tarjeta a la vista no arrastra al mapa", () => {
  it("no usa scrollIntoView, que mueve tambien lo de alrededor", async () => {
    const espia = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = espia;
    // jsdom no implementa scrollTo; hace falta para que el efecto no reviente.
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as Element["scrollTo"];
    try {
      pintar();
      await waitFor(() => expect(tarjetas().length).toBe(6));
      fireEvent.click(screen.getByTestId("pin"));
      await waitFor(() => expect(tarjetas().length).toBe(1));
      expect(espia).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

/**
 * LA TIRA NO PUEDE CAMBIAR DE ALTO.
 *
 * El mapa es `flex-1`: se queda con lo que le sobre a la tira. Si la tira crece
 * o mengua, el mapa cambia de TAMAÑO — y Google recentra el mapa por su cuenta
 * cuando eso ocurre.
 *
 * Eso era el salto que se persiguió durante cinco intentos: un tirón seco unos
 * 300 ms después de centrar el pin, que no salía en ningún registro porque no
 * lo pedía nuestro código. Lo delató una traza tomada en producción: nueve
 * `setCenter` seguidos (la animación de centrado) y luego UNO suelto, aislado,
 * y todos marcados como GOOGLE.
 *
 * Y la tira cambiaba de alto sin que nadie lo pidiera: al pulsar un pin se
 * queda con un solo aviso, y una tarjeta con la línea de "Anunciante
 * verificado" mide unos píxeles más que una sin ella. Con eso bastaba.
 */
describe("la tira no cambia de alto y por eso el mapa no se recentra solo", () => {
  const tira = (c: HTMLElement) => c.querySelector('[class*="snap-x"]') as HTMLElement;

  it("tiene una altura fija, no la que dicte su contenido", async () => {
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    expect(tira(container).className).toMatch(/h-\[\d+rem\]/);
  });

  it("y la conserva al quedarse con un solo aviso", async () => {
    // Este es el momento exacto en el que el mapa se recentraba solo: seis
    // tarjetas pasan a una. Se compara SOLO el alto: otras clases sí cambian
    // (con un aviso la tarjeta se centra), pero el alto no puede.
    const alto = (c: HTMLElement) => tira(c).className.match(/h-\[\d+rem\]/)?.[0];
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    const antes = alto(container);

    fireEvent.click(screen.getByTestId("pin"));
    await waitFor(() => expect(tarjetas().length).toBe(1));

    expect(alto(container)).toBe(antes);
  });

  it("no se puede desplazar en vertical", async () => {
    // Poco evidente: al poner `overflow-x: auto`, el eje VERTICAL deja de ser
    // `visible` y pasa también a `auto`. La tira se podía arrastrar hacia abajo
    // sin que nadie lo hubiera pedido, y bastaban tres píxeles de mas para que
    // apareciera la barra.
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    expect(tira(container).className).toContain("overflow-y-hidden");
  });

  it("con un solo aviso la tarjeta se centra, en vez de dejar un vacio al lado", async () => {
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    expect(tira(container).className).not.toContain("justify-center");

    fireEvent.click(screen.getByTestId("pin"));
    await waitFor(() => expect(tarjetas().length).toBe(1));

    expect(tira(container).className).toContain("justify-center");
  });

  it("las tarjetas no se estiran hasta el alto del contenedor", async () => {
    // Con `items-stretch` una sola tarjeta se estiraría a los 17rem y el bloque
    // de texto quedaría con un hueco enorme debajo del precio.
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    expect(tira(container).className).toContain("items-start");
  });
});

describe("el reparto de la pantalla en escritorio", () => {
  it("usa fracciones, no un minmax con porcentaje", async () => {
    // `minmax(420px, 45%)` contra un `1fr` al lado NO da el 45 %: el track se
    // queda pegado a su minimo. La columna medía 445 px, entraba UNA tarjeta
    // por fila y salia del ancho entero, con una foto de 334 px de alto.
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    // Hay dos rejillas con `lg:grid-cols-[`: la del reparto y la de las
    // tarjetas. La del reparto es la que lleva `lg:min-h-0`.
    const rejilla = [...container.querySelectorAll("div")]
      .find((d) => d.className.includes("lg:grid-cols-[") && d.className.includes("lg:min-h-0"))!;
    expect(rejilla.className).toContain("2fr");
    expect(rejilla.className).not.toContain("45%");
  });
});

describe("las tarjetas del mapa miden lo mismo que las del listado", () => {
  it("la tarjeta se estira con la rejilla, no solo su envoltorio", async () => {
    // En el listado la tarjeta es hija DIRECTA de la rejilla, así que se estira
    // sola y toda la fila cuadra por abajo. Aquí va dentro de otro div —el que
    // capta el ratón y pinta el aro de seleccionado—, de modo que la rejilla
    // estiraba el envoltorio y la tarjeta se quedaba con su alto propio: el aro
    // sobresalía por debajo y los bordes de una misma fila no coincidían.
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    // Por nombre de clase y no con `querySelector`: los dos puntos de
    // `lg:h-full` hay que escaparlos en CSS y un descuido ahí no falla, pasa.
    const conEstiron = [...container.querySelectorAll("div")]
      .filter((d) => d.className.split(" ").includes("lg:h-full"));
    expect(conEstiron).toHaveLength(6);
  });

  it("caben varias tarjetas por fila y no una estirada a lo ancho", async () => {
    // El mínimo estaba en 230 px para una columna que es el 40 % de la
    // pantalla: por debajo de ~1100 px de ancho dejaban de caber dos y
    // `auto-fill` estiraba UNA hasta los 378 px, más del doble que las 166 del
    // listado a esa misma anchura.
    const { container } = pintar();
    await waitFor(() => expect(tarjetas().length).toBe(6));
    const clases = (container.querySelector('[class*="snap-x"]') as HTMLElement).className;
    const min = /minmax\((\d+)px,1fr\)/.exec(clases);
    expect(min).toBeTruthy();
    expect(Number(min![1])).toBeLessThanOrEqual(180);
  });
});
