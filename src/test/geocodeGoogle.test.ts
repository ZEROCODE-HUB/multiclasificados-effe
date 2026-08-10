import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Buscar una dirección al publicar. Con llave de Google usa su Geocoding API
// (mucho mejor cobertura de calles en Perú); sin llave cae a Nominatim, que es
// gratis pero flojo y con límite de una consulta por segundo.
//
// Se usa Geocoding y no Places, comprobado contra la llave real: Geocoding
// responde con cabeceras CORS —el navegador la deja llamar—, Places legacy no,
// y Places (New) hay que habilitarla aparte en la consola de Google.

const fetchMock = vi.fn();

async function cargar(conLlave: boolean) {
  vi.resetModules();
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", conLlave ? "llave-de-prueba" : "");
  return import("@/lib/geocode");
}

// Forma real de la respuesta de la Geocoding API.
const respuestaGoogle = {
  status: "OK",
  results: [
    {
      formatted_address: "Av. José Larco 1234, Miraflores 15074, Perú",
      geometry: { location: { lat: -12.1215, lng: -77.0301 } },
    },
    {
      formatted_address: "Av. José Larco 1300, Miraflores, Perú",
      geometry: { location: { lat: -12.1225, lng: -77.0305 } },
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
  it("consulta la Geocoding API y devuelve los resultados con su punto", async () => {
    fetchMock.mockReturnValue(ok(respuestaGoogle));
    const { buscarDirecciones } = await cargar(true);

    const rs = await buscarDirecciones("Av. Larco 1234, Miraflores, Lima");

    expect(rs).toHaveLength(2);
    expect(rs[0].label).toBe("Av. José Larco 1234, Miraflores 15074, Perú");
    expect(rs[0].lat).toBeCloseTo(-12.1215, 4);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("https://maps.googleapis.com/maps/api/geocode/json");
    expect(url).toContain("key=llave-de-prueba");
  });

  it("busca en Perú, en español y alrededor de la zona elegida", async () => {
    fetchMock.mockReturnValue(ok(respuestaGoogle));
    const { buscarDirecciones } = await cargar(true);

    await buscarDirecciones("Av. Larco 1234", { lat: -12.12, lng: -77.03 });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("language")).toBe("es");
    // Sin limitar el país, "Av. Larco" puede caer en otro sitio del mundo.
    expect(url.searchParams.get("components")).toBe("country:PE");
    // Y sin el recuadro, en otra ciudad del Perú.
    const bounds = url.searchParams.get("bounds")!;
    const [sw, ne] = bounds.split("|").map((p) => p.split(",").map(Number));
    expect(sw[0]).toBeLessThan(-12.12);
    expect(ne[0]).toBeGreaterThan(-12.12);
  });

  it("descarta resultados sin coordenadas en vez de colar un pin inválido", async () => {
    fetchMock.mockReturnValue(
      ok({ status: "OK", results: [{ formatted_address: "Sin punto" }, ...respuestaGoogle.results] }),
    );
    const { buscarDirecciones } = await cargar(true);

    const rs = await buscarDirecciones("lo que sea");
    expect(rs).toHaveLength(2);
    expect(rs.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))).toBe(true);
  });

  it("una dirección que no existe devuelve vacío, sin tratarlo como error", async () => {
    fetchMock.mockReturnValue(ok({ status: "ZERO_RESULTS", results: [] }));
    const { buscarDirecciones } = await cargar(true);
    expect(await buscarDirecciones("calle que no existe 999")).toEqual([]);
  });

  it("un problema de configuración (llave sin permisos) no rompe la publicación", async () => {
    fetchMock.mockReturnValue(
      ok({ status: "REQUEST_DENIED", error_message: "API key not authorized" }),
    );
    const { buscarDirecciones } = await cargar(true);
    expect(await buscarDirecciones("Av. Larco 1234")).toEqual([]);
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
    expect((await geocode("Av. Larco"))?.label).toBe("Av. José Larco 1234, Miraflores 15074, Perú");

    fetchMock.mockReturnValue(ok({ status: "ZERO_RESULTS", results: [] }));
    const { geocode: geocode2 } = await cargar(true);
    expect(await geocode2("no existe")).toBeNull();
  });
});
