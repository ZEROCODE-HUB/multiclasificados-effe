import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * EL SALTO DE LOS PINES AL SOLTAR EL MAPA.
 *
 * El agrupador de Google se re-dibuja en CADA `idle` del mapa, o sea cada vez
 * que el mapa se queda quieto — tambien al terminar un simple arrastre. Y
 * re-dibujar no es repintar: la libreria vuelve a asignarle el mapa a TODOS los
 * marcadores, lo que los reinserta. Un marcador reinsertado se pinta un
 * fotograma en su posicion base, sin la transformacion que lo coloca, y al
 * siguiente ya aparece en su sitio.
 *
 * Eso era el "vuelven a su posicion anterior y luego se ponen en la correcta",
 * con todos los pines a la vez, que no aparecia en ninguna traza del mapa
 * porque el mapa no se movia: se movian los pines.
 *
 * Se le quita esa escucha y se pone una que solo re-dibuja al CAMBIAR EL ZOOM,
 * que es lo unico que altera los grupos: SuperCluster agrupa por geografia, no
 * por lo que se ve en pantalla.
 */

const render = vi.fn();
let idleCb: (() => void) | null = null;

vi.mock("@googlemaps/markerclusterer", () => ({
  MarkerClusterer: class {
    idleListener: unknown = { esElOriginal: true };
    render = render;
  },
  SuperClusterAlgorithm: class {},
}));
vi.mock("@/components/mapIcons", () => ({ pinDeGrupo: () => document.createElement("div") }));

import { crearAgrupador } from "@/components/mapCluster";

let zoom = 12;
const quitados: unknown[] = [];

const mapaFalso = {
  getZoom: () => zoom,
  addListener: (ev: string, cb: () => void) => {
    if (ev === "idle") idleCb = cb;
    return { ev };
  },
} as unknown as google.maps.Map;

const libs = { marker: { AdvancedMarkerElement: class {} } } as never;

beforeEach(() => {
  render.mockClear();
  idleCb = null;
  quitados.length = 0;
  zoom = 12;
  (globalThis as unknown as { google: unknown }).google = {
    maps: { event: { removeListener: (h: unknown) => quitados.push(h) } },
  };
});

describe("el agrupador solo se re-dibuja cuando cambia el zoom", () => {
  it("le quita a la libreria su escucha automatica de idle", () => {
    crearAgrupador(mapaFalso, libs, []);
    expect(quitados).toEqual([{ esElOriginal: true }]);
  });

  it("arrastrar el mapa NO lo re-dibuja: ahi estaba el salto", () => {
    crearAgrupador(mapaFalso, libs, []);
    // Soltar tras arrastrar: el mapa queda quieto, pero el zoom es el mismo.
    idleCb!();
    idleCb!();
    expect(render).not.toHaveBeenCalled();
  });

  it("pero cambiar el zoom SI, que es lo unico que altera los grupos", () => {
    crearAgrupador(mapaFalso, libs, []);
    zoom = 14;
    idleCb!();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("y no se re-dibuja dos veces por el mismo zoom", () => {
    crearAgrupador(mapaFalso, libs, []);
    zoom = 14;
    idleCb!();
    idleCb!();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
