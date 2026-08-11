import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Deducir el departamento y el distrito del punto que marca el anunciante.
 *
 * Es lo que permite que publicar sea "marca dónde está" y nada más. Si esto
 * falla, el aviso se queda sin departamento y no aparece en NINGUNA búsqueda por
 * ubicación — un fallo silencioso, que nadie ve hasta que el anunciante se queja
 * de que su aviso no sale.
 *
 * Las respuestas de abajo son las que devuelve Google de verdad para esos
 * puntos, copiadas de una consulta real a la API. No están inventadas, porque
 * los nombres no salen donde uno esperaría: el departamento de Lima viene como
 * "Provincia de Lima" en la capital y como "Gobierno Regional de Lima" en el
 * resto, y el Cusco viene con zeta.
 */

vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "llave-de-prueba");

const { ubicacionDeCoordenadas } = await import("@/lib/geocode");

/** Construye la respuesta de Google a partir de sus componentes. */
const respuesta = (comp: Record<string, string>) => ({
  status: "OK",
  results: [{
    address_components: Object.entries(comp).map(([types, long_name]) => ({
      long_name, types: types.split("+"),
    })),
  }],
});

const responder = (cuerpo: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => cuerpo });

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

const LIMA = {
  administrative_area_level_1: "Provincia de Lima",
  administrative_area_level_2: "Lima",
  "locality+administrative_area_level_3": "Miraflores",
  country: "Perú",
};
const CHANCAY = {
  administrative_area_level_1: "Gobierno Regional de Lima",
  administrative_area_level_2: "Huaral",
  locality: "Chancay",
  country: "Perú",
};
const CUSCO = {
  administrative_area_level_1: "Cuzco",
  administrative_area_level_2: "Cuzco",
  locality: "Cusco",
  country: "Perú",
};
const TRUJILLO = {
  administrative_area_level_1: "La Libertad",
  administrative_area_level_2: "Trujillo",
  locality: "Trujillo",
  country: "Perú",
};

describe("qué hay en el punto del mapa", () => {
  it("Miraflores → región de Lima y referencia con su provincia", async () => {
    vi.stubGlobal("fetch", responder(respuesta(LIMA)));
    const r = await ubicacionDeCoordenadas(-12.1219, -77.0297);
    expect(r.region).toBe("Provincia de Lima");
    expect(r.referencia).toBe("Miraflores, Lima");
  });

  it("Chancay → la provincia SÍ aporta, porque no es la capital", async () => {
    vi.stubGlobal("fetch", responder(respuesta(CHANCAY)));
    const r = await ubicacionDeCoordenadas(-11.5715, -77.2712);
    expect(r.region).toBe("Gobierno Regional de Lima");
    expect(r.referencia).toBe("Chancay, Huaral");
  });

  it("Cusco → no dice 'Cusco, Cuzco': la zeta y la ese son lo mismo", async () => {
    vi.stubGlobal("fetch", responder(respuesta(CUSCO)));
    const r = await ubicacionDeCoordenadas(-13.5226, -71.9673);
    expect(r.referencia).toBe("Cusco");
  });

  it("Trujillo → no repite el nombre dos veces", async () => {
    vi.stubGlobal("fetch", responder(respuesta(TRUJILLO)));
    const r = await ubicacionDeCoordenadas(-8.1116, -79.0288);
    expect(r.referencia).toBe("Trujillo");
  });

  it("un punto fuera del Perú no devuelve nada", async () => {
    // Si devolviera algo, un pin arrastrado sin querer a Bolivia acabaría
    // archivando el aviso en un departamento peruano cualquiera.
    vi.stubGlobal("fetch", responder(respuesta({
      administrative_area_level_1: "La Paz", locality: "La Paz", country: "Bolivia",
    })));
    const r = await ubicacionDeCoordenadas(-16.5, -68.15);
    expect(r).toEqual({ region: null, referencia: null });
  });

  it("sin resultados devuelve vacío, no revienta", async () => {
    vi.stubGlobal("fetch", responder({ status: "ZERO_RESULTS", results: [] }));
    expect(await ubicacionDeCoordenadas(0, 0)).toEqual({ region: null, referencia: null });
  });

  it("si Google se cae devuelve vacío, no revienta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    expect(await ubicacionDeCoordenadas(-12, -77)).toEqual({ region: null, referencia: null });
  });

  it("pide una sola consulta, no una por dato", async () => {
    const f = responder(respuesta(LIMA));
    vi.stubGlobal("fetch", f);
    await ubicacionDeCoordenadas(-12.1219, -77.0297);
    expect(f).toHaveBeenCalledTimes(1);
    // Sin `result_type`: filtrando por región se perdería el distrito.
    expect(String(f.mock.calls[0][0])).not.toContain("result_type");
  });
});

describe("de la región de Google al departamento del catálogo", () => {
  it("reconoce las tres formas raras que devuelve Google", async () => {
    const { departamentoDeTexto } = await import("@/lib/departamentos");
    expect(departamentoDeTexto("Provincia de Lima")?.id).toBe("15");
    expect(departamentoDeTexto("Gobierno Regional de Lima")?.id).toBe("15");
    expect(departamentoDeTexto("Cuzco")?.id).toBe("08");
    expect(departamentoDeTexto("La Libertad")?.id).toBe("13");
  });
});
