import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Buscar una dirección al publicar. Con llave de Google usa su Places API (mucho
// mejor cobertura de calles en Perú); sin llave cae a Nominatim, que es gratis
// pero flojo y con límite de una consulta por segundo.
//
// Se usa la Places API NUEVA a propósito: la de geocodificación clásica de
// Google no admite llamadas desde el navegador (no manda cabeceras CORS).

const fetchMock = vi.fn();

async function cargar(conLlave: boolean) {
  vi.resetModules();
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", conLlave ? "llave-de-prueba" : "");
  return import("@/lib/geocode");
}

const respuestaGoogle = {
  places: [
    {
      displayName: { text: "Av. José Larco 1234" },
      formattedAddress: "Av. José Larco 1234, Miraflores 15074, Perú",
      location: { latitude: -12.1215, longitude: -77.0301 },
    },
    {
      displayName: { text: "Av. José Larco 1300" },
      formattedAddress: "Av. José Larco 1300, Miraflores, Perú",
      location: { latitude: -12.1225, longitude: -77.0305 },
    },
  ],
};

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("buscar direcciones — con llave de Google", () => {
  it("consulta la Places API nueva y devuelve los resultados con su punto", async () => {
    fetchMock.mockReturnValue(ok(respuestaGoogle));
    const { buscarDirecciones } = await cargar(true);

    const rs = await buscarDirecciones("Av. Larco 1234, Miraflores, Lima");

    expect(rs).toHaveLength(2);
    expect(rs[0].label).toBe("Av. José Larco 1234");
    expect(rs[0].lat).toBeCloseTo(-12.1215, 4);

    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    // La llave viaja en cabecera, no en la URL.
    expect(opciones.headers["X-Goog-Api-Key"]).toBe("llave-de-prueba");
    // El FieldMask es obligatorio Y define cuánto cuesta la consulta: solo los
    // tres campos que se usan.
    expect(opciones.headers["X-Goog-FieldMask"]).toBe(
      "places.displayName,places.formattedAddress,places.location",
    );
  });

  it("busca en Perú, en español y alrededor de la zona elegida", async () => {
    fetchMock.mockReturnValue(ok(respuestaGoogle));
    const { buscarDirecciones } = await cargar(true);

    await buscarDirecciones("Av. Larco 1234", { lat: -12.12, lng: -77.03 });

    const cuerpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpo.regionCode).toBe("PE");
    expect(cuerpo.languageCode).toBe("es");
    // Sin este sesgo, "Av. Larco" sale en media docena de ciudades.
    expect(cuerpo.locationBias.circle.center).toEqual({ latitude: -12.12, longitude: -77.03 });
  });

  it("descarta resultados sin coordenadas en vez de colar un pin inválido", async () => {
    fetchMock.mockReturnValue(
      ok({ places: [{ displayName: { text: "Sin punto" } }, ...respuestaGoogle.places] }),
    );
    const { buscarDirecciones } = await cargar(true);

    const rs = await buscarDirecciones("lo que sea");
    expect(rs).toHaveLength(2);
    expect(rs.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))).toBe(true);
  });

  it("si Google rechaza la llave, devuelve vacío y no rompe la publicación", async () => {
    // Buscar la dirección es una comodidad: siempre queda marcar el punto a mano.
    fetchMock.mockReturnValue(Promise.resolve({ ok: false, status: 403 }));
    const { buscarDirecciones } = await cargar(true);

    expect(await buscarDirecciones("Av. Larco 1234")).toEqual([]);
  });

  it("si la red falla, tampoco rompe", async () => {
    fetchMock.mockRejectedValue(new Error("sin conexión"));
    const { buscarDirecciones } = await cargar(true);

    expect(await buscarDirecciones("Av. Larco 1234")).toEqual([]);
  });
});

describe("buscar direcciones — sin llave (respaldo)", () => {
  it("usa Nominatim y no llama a Google", async () => {
    fetchMock.mockReturnValue(
      ok([{ lat: "-12.1215", lon: "-77.0301", name: "Avenida José Larco", display_name: "Avenida José Larco, Miraflores, Lima" }]),
    );
    const { buscarDirecciones } = await cargar(false);

    const rs = await buscarDirecciones("Av. Larco, Miraflores");

    expect(rs[0].lat).toBeCloseTo(-12.1215, 4);
    expect(String(fetchMock.mock.calls[0][0])).toContain("nominatim.openstreetmap.org");
    expect(String(fetchMock.mock.calls[0][0])).toContain("countrycodes=pe");
  });

  it("hayGoogleMaps dice si la llave está puesta", async () => {
    expect((await cargar(false)).hayGoogleMaps()).toBe(false);
    expect((await cargar(true)).hayGoogleMaps()).toBe(true);
  });
});

describe("buscar direcciones — casos vacíos", () => {
  it("con texto vacío no consulta nada", async () => {
    const { buscarDirecciones } = await cargar(true);
    expect(await buscarDirecciones("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("geocode devuelve solo el primero, o null", async () => {
    fetchMock.mockReturnValue(ok(respuestaGoogle));
    const { geocode } = await cargar(true);
    expect((await geocode("Av. Larco"))?.label).toBe("Av. José Larco 1234");

    fetchMock.mockReturnValue(ok({ places: [] }));
    const { geocode: geocode2 } = await cargar(true);
    expect(await geocode2("no existe")).toBeNull();
  });
});
