import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * El cargador del SDK de mapas.
 *
 * Parece fontanería, pero decide dos cosas que se pagan y que se ven:
 *
 *   · que el SDK se descargue UNA vez por sesión aunque el usuario pase por la
 *     portada, el buscador y la ficha del aviso — son cuatro mapas;
 *   · que un fallo de red al entrar no deje la app sin mapas hasta que se
 *     recargue la página entera.
 */

const importLibrary = vi.fn();
const setOptions = vi.fn();
vi.mock("@googlemaps/js-api-loader", () => ({
  importLibrary: (...a: unknown[]) => importLibrary(...a),
  setOptions: (...a: unknown[]) => setOptions(...a),
}));

async function cargar(env: Record<string, string>) {
  vi.resetModules();
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", env.VITE_GOOGLE_MAPS_API_KEY ?? "");
  vi.stubEnv("VITE_GOOGLE_MAPS_MAP_ID", env.VITE_GOOGLE_MAPS_MAP_ID ?? "");
  return import("@/lib/googleMaps");
}

const CON_LLAVE = { VITE_GOOGLE_MAPS_API_KEY: "llave", VITE_GOOGLE_MAPS_MAP_ID: "mapa-de-effe" };

beforeEach(() => {
  importLibrary.mockReset().mockResolvedValue({});
  setOptions.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("cargar el SDK de mapas", () => {
  it("sin llave no intenta cargar nada", async () => {
    const { hayMapasDeGoogle, cargarMapas } = await cargar({});
    expect(hayMapasDeGoogle()).toBe(false);
    await expect(cargarMapas()).rejects.toThrow(/VITE_GOOGLE_MAPS_API_KEY/);
    expect(importLibrary).not.toHaveBeenCalled();
  });

  it("pide las dos piezas que usa la app: el mapa y los marcadores", async () => {
    const { cargarMapas } = await cargar(CON_LLAVE);
    await cargarMapas();
    expect(importLibrary.mock.calls.map((c) => c[0]).sort()).toEqual(["maps", "marker"]);
  });

  it("va configurado en español y para Perú", async () => {
    const { cargarMapas } = await cargar(CON_LLAVE);
    await cargarMapas();
    expect(setOptions).toHaveBeenCalledWith(expect.objectContaining({
      key: "llave", language: "es", region: "PE",
    }));
  });

  it("cuatro mapas, una sola descarga", async () => {
    // Es lo que evita pagar cuatro cargas y esperar cuatro veces por lo mismo.
    const { cargarMapas } = await cargar(CON_LLAVE);
    await Promise.all([cargarMapas(), cargarMapas(), cargarMapas(), cargarMapas()]);
    expect(importLibrary).toHaveBeenCalledTimes(2); // maps + marker, y ya
  });

  it("un fallo de red no deja la app sin mapas para siempre", async () => {
    const { cargarMapas } = await cargar(CON_LLAVE);
    importLibrary.mockRejectedValueOnce(new Error("sin red"));

    await expect(cargarMapas()).rejects.toThrow();

    // El siguiente mapa que se monte vuelve a intentarlo, en vez de heredar el
    // fallo del primero hasta que alguien recargue la página.
    importLibrary.mockResolvedValue({});
    await expect(cargarMapas()).resolves.toBeTruthy();
  });
});

describe("el Map ID", () => {
  it("se usa el del proyecto cuando está configurado", async () => {
    const { MAPA_ID } = await cargar(CON_LLAVE);
    expect(MAPA_ID).toBe("mapa-de-effe");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("si falta, avisa a gritos en vez de dejar el mapa sin un solo pin", async () => {
    // Los marcadores modernos no se dibujan sin Map ID. Fallar en silencio
    // sería un mapa correcto y vacío, imposible de diagnosticar.
    const { MAPA_ID, cargarMapas } = await cargar({ VITE_GOOGLE_MAPS_API_KEY: "llave" });
    expect(MAPA_ID).toBe("DEMO_MAP_ID");
    await cargarMapas();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("VITE_GOOGLE_MAPS_MAP_ID"));
  });

  it("no repite el aviso en cada mapa que se monta", async () => {
    const { cargarMapas } = await cargar({ VITE_GOOGLE_MAPS_API_KEY: "llave" });
    await cargarMapas();
    await cargarMapas();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe("qué se le dice al usuario cuando no hay mapa", () => {
  it("nunca se queda el hueco en blanco", async () => {
    const { textoDeEstadoDelMapa } = await cargar(CON_LLAVE);
    // Un recuadro vacío se lee como una avería de la página entera.
    expect(textoDeEstadoDelMapa("cargando")).toMatch(/cargando/i);
    expect(textoDeEstadoDelMapa("sin-llave")).toMatch(/configurado/i);
    expect(textoDeEstadoDelMapa("error")).toMatch(/no se pudo/i);
  });

  it("con el mapa puesto no se dice nada", async () => {
    const { textoDeEstadoDelMapa } = await cargar(CON_LLAVE);
    expect(textoDeEstadoDelMapa("listo")).toBeNull();
  });
});
