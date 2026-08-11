import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Buscar una dirección al publicar, con Places API (New).
 *
 * Places es el servicio hecho para esto: entiende texto a medias y devuelve
 * PREDICCIONES, no direcciones. La contrapartida es que no trae coordenadas: hay
 * que pedir el detalle del lugar elegido, y esa segunda llamada es también la
 * que cierra la sesión de facturación. Todas las teclas de una búsqueda
 * comparten sesión; sin eso, Places cobraría cada pulsación por separado.
 *
 * Hay un respaldo por Geocoding para el caso de que Places no esté habilitada en
 * el proyecto de Google. No es la forma buena de hacerlo —lo avisa por consola—
 * pero evita que publicar se quede sin buscador mientras se configura la consola.
 */

const fetchMock = vi.fn();

async function cargar(conLlave = true) {
  vi.resetModules();
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", conLlave ? "llave-de-prueba" : "");
  return import("@/lib/geocode");
}

const ok = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const falla = (status: number) => Promise.resolve({ ok: false, status, json: () => Promise.resolve({}) });

// Forma real de la respuesta de Places Autocomplete (New).
const PREDICCIONES = {
  suggestions: [
    {
      placePrediction: {
        placeId: "ChIJ-larco",
        text: { text: "Av. José Larco 1234, Miraflores, Perú" },
        structuredFormat: {
          mainText: { text: "Av. José Larco 1234" },
          secondaryText: { text: "Miraflores, Lima, Perú" },
        },
      },
    },
    {
      placePrediction: {
        placeId: "ChIJ-mirafl-aqp",
        text: { text: "Miraflores, Arequipa, Perú" },
        structuredFormat: {
          mainText: { text: "Miraflores" },
          secondaryText: { text: "Arequipa, Perú" },
        },
      },
    },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sugerir direcciones con Places", () => {
  it("llama a Places y devuelve el título y el detalle de cada predicción", async () => {
    fetchMock.mockReturnValue(ok(PREDICCIONES));
    const { sugerirDirecciones } = await cargar();

    const rs = await sugerirDirecciones("av larco");

    expect(rs).toHaveLength(2);
    expect(rs[0]).toMatchObject({
      id: "ChIJ-larco",
      titulo: "Av. José Larco 1234",
      detalle: "Miraflores, Lima, Perú",
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://places.googleapis.com/v1/places:autocomplete");
  });

  it("va con la llave en la cabecera, en español y limitado al Perú", async () => {
    fetchMock.mockReturnValue(ok(PREDICCIONES));
    const { sugerirDirecciones } = await cargar();
    await sugerirDirecciones("av larco");

    const opciones = fetchMock.mock.calls[0][1] as { method: string; headers: Record<string, string>; body: string };
    expect(opciones.method).toBe("POST");
    expect(opciones.headers["X-Goog-Api-Key"]).toBe("llave-de-prueba");
    const cuerpo = JSON.parse(opciones.body);
    expect(cuerpo.languageCode).toBe("es");
    // Sin esto, "Av. Larco" puede caer en cualquier país del mundo.
    expect(cuerpo.includedRegionCodes).toEqual(["pe"]);
  });

  it("manda la sesión, que es lo que hace que la búsqueda entera cueste una", async () => {
    fetchMock.mockReturnValue(ok(PREDICCIONES));
    const { sugerirDirecciones } = await cargar();
    await sugerirDirecciones("av larco", { sesion: "abc-123" });

    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body).sessionToken).toBe("abc-123");
  });

  it("con el pin ya puesto, prefiere las direcciones de esa zona", async () => {
    fetchMock.mockReturnValue(ok(PREDICCIONES));
    const { sugerirDirecciones } = await cargar();
    await sugerirDirecciones("av larco", { sesgo: { lat: -12.12, lng: -77.03 } });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(cuerpo.locationBias.circle.center).toEqual({ latitude: -12.12, longitude: -77.03 });
    // Preferencia, no filtro: `locationBias` y NO `locationRestriction`.
    expect(cuerpo.locationRestriction).toBeUndefined();
  });

  it("descarta predicciones sin identificador: no se puede pedir su punto", async () => {
    fetchMock.mockReturnValue(ok({
      suggestions: [
        { queryPrediction: { text: { text: "pizzerías cerca" } } },
        PREDICCIONES.suggestions[0],
      ],
    }));
    const { sugerirDirecciones } = await cargar();
    expect(await sugerirDirecciones("pizza")).toHaveLength(1);
  });

  it("con texto vacío no consulta nada", async () => {
    const { sugerirDirecciones } = await cargar();
    expect(await sugerirDirecciones("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin llave no consulta nada", async () => {
    const { sugerirDirecciones } = await cargar(false);
    expect(await sugerirDirecciones("av larco")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("respaldo cuando Places no está habilitada", () => {
  // Es el caso real de un proyecto de Google recién configurado: Places (New)
  // viene desactivada y responde 403. Publicar no puede quedarse sin buscador
  // de direcciones por eso.
  const GEOCODING = {
    status: "OK",
    results: [{
      place_id: "geo-mirafl-lima",
      formatted_address: "Miraflores, Perú",
      address_components: [
        { long_name: "Miraflores", types: ["locality", "political"] },
        { long_name: "Lima", types: ["administrative_area_level_2", "political"] },
        { long_name: "Provincia de Lima", types: ["administrative_area_level_1", "political"] },
        { long_name: "Perú", types: ["country", "political"] },
      ],
    }],
  };

  it("si Places responde 403, busca por Geocoding", async () => {
    fetchMock.mockReturnValueOnce(falla(403)).mockReturnValue(ok(GEOCODING));
    const { sugerirDirecciones } = await cargar();

    const rs = await sugerirDirecciones("mirafl");

    expect(rs).toHaveLength(1);
    expect(rs[0].titulo).toBe("Miraflores");            // sin el ", Perú"
    expect(rs[0].detalle).toBe("Lima, Provincia de Lima");
    expect(String(fetchMock.mock.calls[1][0])).toContain("maps/api/geocode/json");
  });

  it("lo avisa por consola: es una red de seguridad, no la forma buena", async () => {
    fetchMock.mockReturnValueOnce(falla(403)).mockReturnValue(ok(GEOCODING));
    const { sugerirDirecciones } = await cargar();
    await sugerirDirecciones("mirafl");
    expect(console.warn).toHaveBeenCalled();
  });

  it("si también falla el respaldo, devuelve vacío y no rompe la publicación", async () => {
    fetchMock.mockRejectedValue(new Error("sin red"));
    const { sugerirDirecciones } = await cargar();
    expect(await sugerirDirecciones("mirafl")).toEqual([]);
  });

  it("dos resultados que se leerían igual se quedan en uno", async () => {
    const repetido = GEOCODING.results[0];
    fetchMock.mockReturnValueOnce(falla(403)).mockReturnValue(ok({
      status: "OK",
      results: [repetido, { ...repetido, place_id: "otro" }],
    }));
    const { sugerirDirecciones } = await cargar();
    expect(await sugerirDirecciones("mirafl")).toHaveLength(1);
  });
});

describe("el detalle del lugar elegido", () => {
  const DETALLE = {
    location: { latitude: -12.1215, longitude: -77.0301 },
    addressComponents: [
      { longText: "Miraflores", types: ["locality", "political"] },
      { longText: "Lima", types: ["administrative_area_level_2", "political"] },
      { longText: "Provincia de Lima", types: ["administrative_area_level_1", "political"] },
      { longText: "Perú", types: ["country", "political"] },
    ],
  };

  it("una sola llamada trae el punto Y la zona", async () => {
    // Es la clave del diseño: sin esto habría que geocodificar al revés el punto
    // recién obtenido, o sea pagar y esperar dos veces por lo mismo.
    fetchMock.mockReturnValue(ok(DETALLE));
    const { detalleDeLugar } = await cargar();

    const r = await detalleDeLugar("ChIJ-larco", "abc-123");

    expect(r).toEqual({
      lat: -12.1215, lng: -77.0301,
      region: "Provincia de Lima", referencia: "Miraflores, Lima",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cierra la sesión de facturación con el mismo identificador", async () => {
    fetchMock.mockReturnValue(ok(DETALLE));
    const { detalleDeLugar } = await cargar();
    await detalleDeLugar("ChIJ-larco", "abc-123");

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/places/ChIJ-larco");
    expect(url.searchParams.get("sessionToken")).toBe("abc-123");
  });

  it("pide solo los campos que usa: el FieldMask es lo que se cobra", async () => {
    fetchMock.mockReturnValue(ok(DETALLE));
    const { detalleDeLugar } = await cargar();
    await detalleDeLugar("ChIJ-larco");

    const cabeceras = (fetchMock.mock.calls[0][1] as { headers: Record<string, string> }).headers;
    expect(cabeceras["X-Goog-FieldMask"]).toBe("location,addressComponents");
  });

  it("un lugar sin coordenadas devuelve null en vez de un pin en el mar", async () => {
    fetchMock.mockReturnValue(ok({ addressComponents: DETALLE.addressComponents }));
    const { detalleDeLugar } = await cargar();
    expect(await detalleDeLugar("ChIJ-sin-punto")).toBeNull();
  });

  it("si el servicio falla devuelve null, y publicar sigue siendo posible", async () => {
    fetchMock.mockReturnValue(falla(500));
    const { detalleDeLugar } = await cargar();
    expect(await detalleDeLugar("ChIJ-larco")).toBeNull();
  });
});

describe("las sesiones de búsqueda", () => {
  it("cada una es distinta", async () => {
    const { nuevaSesionDeBusqueda } = await cargar();
    const vistas = new Set(Array.from({ length: 50 }, () => nuevaSesionDeBusqueda()));
    expect(vistas.size).toBe(50);
  });

  it("funciona aunque el navegador no tenga crypto.randomUUID", async () => {
    // WebViews antiguos. El identificador solo tiene que ser distinto por
    // sesión, no criptográficamente fuerte.
    const { nuevaSesionDeBusqueda } = await cargar();
    vi.stubGlobal("crypto", {});
    expect(nuevaSesionDeBusqueda()).toMatch(/^s-\d+-\d+$/);
  });
});

describe("hayGoogleMaps", () => {
  it("dice si la llave está puesta", async () => {
    expect((await cargar(false)).hayGoogleMaps()).toBe(false);
    expect((await cargar(true)).hayGoogleMaps()).toBe(true);
  });
});
