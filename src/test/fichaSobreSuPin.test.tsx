import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * DÓNDE se abre la ficha al pulsar un pin.
 *
 * EL BUG, tal como lo vio el cliente: pulsas el precio, el mapa se centra en
 * él… y la tarjeta no sale encima del pin sino más arriba, descolgada.
 *
 * Eran dos cosas a la vez:
 *
 *  1. Google mide el contenido de la ventanita JUSTO al abrirla, y `render()`
 *     de React 18 no pinta en el acto. Se abría ANTES de pintar, así que medía
 *     un nodo vacío, hacía sitio para nada, y cuando la ficha aparecía —unos
 *     280 px de alto— ya no cabía donde se había hecho hueco.
 *  2. El clic hacía además `panTo` al punto. Ese paneo competía con el que la
 *     propia ventana hace para caber, y entre los dos la dejaban descolocada.
 *
 * Estas pruebas fijan el ORDEN y QUIÉN panea, que es lo que se rompió.
 */

beforeEach(prepararDom);

/** Lo que le pasó a Google, en orden. */
const traza: string[] = [];
/** Cuánto contenido tenía el nodo en el momento exacto de abrir. */
let contenidoAlAbrir = -1;
const panTo = vi.fn();
const clics = new Map<string, () => void>();

let contador = 0;

class MarcadorFalso {
  content: unknown = null;
  position: unknown = null;
  id = "";
  constructor(o: { position: unknown; content: unknown }) {
    this.position = o.position;
    this.content = o.content;
    // Se numeran en el orden en que los crea el componente, que es el de la
    // lista de avisos.
    this.id = AVISOS_IDS[contador++ % AVISOS_IDS.length];
  }
  addListener(evento: string, cb: () => void) {
    if (evento === "gmp-click") clics.set(this.id, cb);
  }
}

class VentanaFalsa {
  nodo: HTMLElement | null = null;
  constructor(o: { content: HTMLElement }) { this.nodo = o.content; }
  setContent(n: HTMLElement) { this.nodo = n; traza.push("setContent"); }
  open() {
    traza.push("open");
    contenidoAlAbrir = this.nodo ? this.nodo.innerHTML.length : -1;
  }
  close() { traza.push("close"); }
}

const mapaFalso = {
  panTo,
  fitBounds: vi.fn(),
  getZoom: () => 12,
  setZoom: vi.fn(),
  setCenter: vi.fn(),
};

const AVISOS_IDS = ["a1", "a2"];

// El componente crea los marcadores con `libs.marker`, no con el global.
//
// LA REFERENCIA TIENE QUE SER ESTABLE. En la app `libs` sale de un useState y
// no cambia; si aquí se devolviera un objeto nuevo por render, el efecto que
// monta los pines se repetiría a cada rerender y volvería a poner el encuadre
// a cero — el mock mentiría y la prueba fallaría por su culpa, no por el
// código. (Pasó al escribir este archivo.)
const LIBS = { maps: {}, marker: { AdvancedMarkerElement: MarcadorFalso } };

vi.mock("@/lib/googleMaps", () => ({
  useMapaDeGoogle: () => ({
    contenedor: { current: null },
    mapa: mapaFalso,
    libs: LIBS,
    estado: "listo",
  }),
  textoDeEstadoDelMapa: () => null,
}));
vi.mock("@/components/mapCluster", () => ({ crearAgrupador: () => ({ clearMarkers: vi.fn() }) }));
vi.mock("@/hooks/useSession", () => ({ useSession: () => ({ supabase: true }) }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => ({ isFavorite: () => false, toggle: vi.fn() }) }));

import { ListingsMap } from "@/components/ListingsMap";

const AVISOS = [
  { id: "a1", title: "Casa en Trujillo", description: "d", price: 250000, currency: "PEN",
    category: "inmuebles", location: "Trujillo", imageUrl: "/f.webp", date: "2026-08-01",
    featured: false, advertiser: "A", views: 0, lat: -8.1, lng: -79.0 },
  { id: "a2", title: "Local en Lima", description: "d", price: 90000, currency: "PEN",
    category: "inmuebles", location: "Lima", imageUrl: "/g.webp", date: "2026-08-02",
    featured: false, advertiser: "B", views: 0, lat: -12.0, lng: -77.0 },
] as never[];

const pintar = (active: string | null = null, onActive = vi.fn()) =>
  render(
    <MemoryRouter>
      <ListingsMap listings={AVISOS} active={active} onActive={onActive} hrefFor={(id) => `/aviso/${id}`} />
    </MemoryRouter>,
  );

beforeEach(() => {
  traza.length = 0;
  contenidoAlAbrir = -1;
  panTo.mockClear();
  clics.clear();
  contador = 0;
  (globalThis as unknown as { google: unknown }).google = {
    maps: {
      InfoWindow: VentanaFalsa,
      LatLngBounds: class { extend() {} isEmpty() { return false; } },
      event: {
        addListenerOnce: vi.fn(),
        removeListener: vi.fn(),
        clearInstanceListeners: vi.fn(),
      },
    },
  };
});

describe("la ficha se abre con el contenido ya pintado", () => {
  it("cuando Google mide, el nodo YA tiene la ficha dentro", async () => {
    // Este es el corazón del arreglo. Si se abriera antes de pintar, Google
    // mediría vacío y haría sitio para una ventana que no existe.
    pintar();
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));
    clics.get("a1")!();
    await waitFor(() => expect(traza).toContain("open"));
    expect(contenidoAlAbrir).toBeGreaterThan(100);
  });

  it("el contenido se pasa ANTES de abrir, no después", async () => {
    pintar();
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));
    clics.get("a1")!();
    await waitFor(() => expect(traza).toContain("open"));
    expect(traza.indexOf("setContent")).toBeLessThan(traza.indexOf("open"));
  });
});

describe("quién mueve el mapa", () => {
  it("al pulsar el pin NO se panea: la ficha ya se coloca sola", async () => {
    // Dos paneos a la vez —el del clic y el que hace la ventana para caber—
    // dejaban el aviso separado de su pin.
    const onActive = vi.fn();
    const { rerender } = pintar(null, onActive);
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));
    const conActivo = (id: string | null) => rerender(
      <MemoryRouter>
        <ListingsMap listings={AVISOS} active={id} onActive={onActive} hrefFor={(i) => `/aviso/${i}`} />
      </MemoryRouter>,
    );

    // PRIMERO se gasta la selección inicial, que el componente omite a
    // propósito para no pisar el encuadre panorámico. Sin este paso el efecto
    // salía antes de llegar al paneo y la prueba pasaba con el bug puesto.
    conActivo("a2");
    await waitFor(() => expect(panTo).toHaveBeenCalledTimes(0));
    panTo.mockClear();

    // Y AHORA sí: el clic en el pin, con el encuadre ya consumido.
    clics.get("a1")!();
    conActivo("a1"); // el padre refleja la selección, igual que SearchPage

    await waitFor(() => expect(traza).toContain("open"));
    expect(panTo).not.toHaveBeenCalled();
  });

  it("pero desde la lista lateral SÍ, que es el único modo de ubicar el aviso", async () => {
    const onActive = vi.fn();
    const { rerender } = pintar(null, onActive);
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));

    // Una primera selección se omite a propósito (no debe pisar el encuadre
    // panorámico inicial), así que hacen falta dos para ver el paneo.
    const conActivo = (id: string) => rerender(
      <MemoryRouter>
        <ListingsMap listings={AVISOS} active={id} onActive={onActive} hrefFor={(i) => `/aviso/${i}`} />
      </MemoryRouter>,
    );
    conActivo("a1");
    conActivo("a2");

    await waitFor(() => expect(panTo).toHaveBeenCalled());
    expect(panTo).toHaveBeenCalledWith({ lat: -12.0, lng: -77.0 });
  });
});
