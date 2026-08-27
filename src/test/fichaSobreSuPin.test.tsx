import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { prepararDom } from "./domPolyfills";

/**
 * QUÉ HACE EL PIN AL PULSARLO.
 *
 * Ya no abre nada. Antes salía un InfoWindow de Google con la ficha del aviso, y
 * dio tres rondas de problemas que no se podían cerrar desde fuera, porque quien
 * coloca y dimensiona esa ventana es Google:
 *
 *   - se montaba fuera del árbol de React y un `<Link>` la dejaba EN BLANCO;
 *   - Google medía el contenido antes de que React lo pintara;
 *   - con el panel a 45vh no cabía y se llenaba de barras de scroll;
 *   - su auto-pan competía con el centrado del pin, y la ficha aparecía donde
 *     el pin ESTABA antes de moverse.
 *
 * Ahora el pin solo avisa de cuál se eligió y el mapa se centra en él. De
 * enseñar el aviso se encarga la tira de tarjetas de abajo, que es React normal
 * dentro del árbol. Estas pruebas fijan ese reparto.
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

describe("el pin solo avisa de cuál se eligió", () => {
  it("no abre ninguna ventana de Google", async () => {
    // La regla que evita volver al problema: si alguien reintroduce el
    // InfoWindow, esto falla.
    const onActive = vi.fn();
    pintar(null, onActive);
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));

    clics.get("a1")!();
    await waitFor(() => expect(onActive).toHaveBeenCalledWith("a1"));
    expect(traza).not.toContain("open");
    expect(traza).not.toContain("setContent");
  });

  it("avisa del aviso pulsado para que la tira de abajo lo enseñe", async () => {
    const onActive = vi.fn();
    pintar(null, onActive);
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));

    clics.get("a2")!();
    expect(onActive).toHaveBeenCalledWith("a2");
  });

  it("y el mapa se centra en el aviso elegido", async () => {
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
