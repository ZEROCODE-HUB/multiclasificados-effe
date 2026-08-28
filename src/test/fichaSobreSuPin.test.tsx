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
/** Lo que se le pidió al mapa, en orden. */
const llamadas: string[] = [];
const panTo = vi.fn();
/** Cada vez que alguien le cambia el zoom al mapa. */
const llamadasDeZoom: number[] = [];
const clics = new Map<string, () => void>();

let contador = 0;
/** Los listeners que el componente deja puestos sobre el mapa. */
const oyentes: Array<{ evento: string; cb: () => void; vivo: boolean }> = [];
/** Todos los marcadores que se han fabricado. */
const creados: MarcadorFalso[] = [];
/** Dispara los listeners vivos de un evento, como haría Google. */
const disparar = (evento: string) => {
  for (const o of oyentes) if (o.evento === evento && o.vivo) { o.vivo = false; o.cb(); }
};

class MarcadorFalso {
  /** Cuántas veces le han REEMPLAZADO el nodo del contenido. */
  reemplazos = 0;
  #contenido: unknown = null;
  get content() { return this.#contenido; }
  set content(v: unknown) { this.reemplazos++; this.#contenido = v; }
  position: unknown = null;
  id = "";
  constructor(o: { position: unknown; content: unknown }) {
    this.position = o.position;
    this.content = o.content;
    this.reemplazos = 0; // el primero es el montaje, no un repintado
    creados.push(this);
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
  fitBounds: () => llamadas.push("fitBounds"),
  // 18: el zoom exagerado al que llega `fitBounds` con los avisos muy juntos,
  // que es justo el caso que la corrección existe para arreglar.
  getZoom: () => 18,
  setZoom: (z: number) => llamadasDeZoom.push(z),
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
  llamadasDeZoom.length = 0;
  llamadas.length = 0;
  clics.clear();
  contador = 0;
  oyentes.length = 0;
  creados.length = 0;
  (globalThis as unknown as { google: unknown }).google = {
    maps: {
      InfoWindow: VentanaFalsa,
      LatLngBounds: class { extend() {} isEmpty() { return false; } },
      event: {
        // Se guardan de verdad para poder dispararlos: son la clave del salto
        // de los pines.
        addListenerOnce: (_o: unknown, evento: string, cb: () => void) => {
          const h = { evento, cb, vivo: true };
          oyentes.push(h);
          return h;
        },
        removeListener: (h: { vivo: boolean }) => { if (h) h.vivo = false; },
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

/**
 * EL SALTO DE TODOS LOS PINES.
 *
 * Lo reportó el cliente así: "sucede incluso si solo muevo el mapa, y se mueven
 * todos los pines".
 *
 * `fitBounds` se pasa de zoom cuando los avisos están muy juntos, y eso se
 * corregía al primer `idle`. Pero `idle` se emite CADA VEZ que el mapa se queda
 * quieto, no solo tras el encuadre: si ese primer `idle` tardaba —el mapa aún
 * sin medir, o el usuario tocándolo antes—, el listener seguía armado y saltaba
 * con el primer movimiento de la persona, cambiando el zoom de golpe.
 */
describe("nadie le cambia el encuadre al usuario por detrás", () => {
  it("si el usuario arrastra, la corrección de zoom se desarma", async () => {
    pintar();
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));
    llamadasDeZoom.length = 0;

    // El usuario arrastra ANTES de que llegue el primer `idle`…
    disparar("dragstart");
    // …y cuando el mapa se queda quieto, ya no se le toca el zoom.
    disparar("idle");

    expect(llamadasDeZoom).toHaveLength(0);
  });

  it("pero si nadie ha tocado nada, el encuadre inicial sí se corrige", async () => {
    // Con avisos muy juntos `fitBounds` se acerca demasiado y hay que bajarlo.
    pintar();
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));
    llamadasDeZoom.length = 0;

    disparar("idle");

    expect(llamadasDeZoom).toHaveLength(1);
  });
});

describe("una lista nueva con los mismos avisos no toca el mapa", () => {
  it("no se reencuadra ni se recolocan los pines", async () => {
    // La otra mitad del "se mueven todos los pines solos". Si la dependencia
    // fuera el array y no su contenido, bastaba con que el padre lo volviera a
    // crear —cosa que hace en cada búsqueda— para destruir los marcadores,
    // rehacer el agrupador y devolver el mapa al encuadre general.
    const onActive = vi.fn();
    const { rerender } = pintar(null, onActive);
    await waitFor(() => expect(clics.size).toBeGreaterThan(0));
    llamadas.length = 0;

    // MISMOS avisos, array nuevo: es lo que devuelve una búsqueda repetida.
    const copia = AVISOS.map((a) => ({ ...(a as object) })) as never[];
    rerender(
      <MemoryRouter>
        <ListingsMap listings={copia} active={null} onActive={onActive} hrefFor={(i) => `/a/${i}`} />
      </MemoryRouter>,
    );

    expect(llamadas).not.toContain("fitBounds");
  });
});

/**
 * EL SALTO DE LOS PINES, esta vez con la causa de verdad.
 *
 * Se persiguió cuatro veces en el sitio equivocado. Lo resolvió una medición en
 * el navegador real: al mover el mapa, `setCenter` lo llamaba GOOGLE (el stack
 * apuntaba a su `map.js`, ni una línea nuestra) y los cuatro pines se desplazaban
 * exactamente el mismo delta — o sea, correctamente, con el mapa.
 *
 * Lo que fallaba era el repintado. Para resaltar el aviso elegido se reasignaba
 * `content` del marcador, y en un `AdvancedMarkerElement` eso DESTRUYE el nodo y
 * monta otro: el nuevo se pinta un fotograma en su posición base, sin la
 * transformación que lo coloca, y al siguiente ya aparece en su sitio. Y se
 * hacía con TODOS los marcadores a la vez.
 */
describe("resaltar un pin no lo vuelve a fabricar", () => {
  const conActivo = (id: string | null, onActive = vi.fn()) => (
    <MemoryRouter>
      <ListingsMap listings={AVISOS} active={id} onActive={onActive} hrefFor={(i) => `/a/${i}`} />
    </MemoryRouter>
  );

  it("cambiar la selección no reemplaza el contenido de ningún marcador", async () => {
    const { rerender } = render(conActivo(null));
    await waitFor(() => expect(creados.length).toBeGreaterThan(0));
    creados.forEach((m) => { m.reemplazos = 0; });

    rerender(conActivo("a1"));
    rerender(conActivo("a2"));

    expect(creados.map((m) => m.reemplazos)).toEqual(creados.map(() => 0));
  });

  it("pero el pin elegido SÍ se resalta", async () => {
    const { rerender } = render(conActivo(null));
    await waitFor(() => expect(creados.length).toBeGreaterThan(0));

    rerender(conActivo("a1"));

    const el = creados[0].content as HTMLElement;
    expect(el.className).toContain("bg-primary");
    // Y los demás se quedan como estaban.
    expect((creados[1].content as HTMLElement).className).toContain("bg-secondary");
  });
});
