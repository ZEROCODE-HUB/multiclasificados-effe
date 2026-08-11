import { describe, it, expect } from "vitest";
import { PERU_BOUNDS, dentroDelPeru } from "@/lib/peru";

/**
 * El encuadre del mapa de la portada. Si se queda corto no se rompe nada —por
 * eso hace falta esta prueba—: simplemente se enseña medio país, o Perú diminuto
 * en mitad del Pacífico, y nadie se entera hasta que alguien mira la portada.
 */
describe("el recuadro del Perú", () => {
  const extremos: Array<[string, number, number]> = [
    ["río Putumayo (extremo norte)", -0.04, -75.19],
    ["Tacna (extremo sur)", -18.35, -70.35],
    ["Punta Balcones (extremo oeste)", -4.68, -81.33],
    ["río Heath (extremo este)", -12.5, -68.66],
  ];

  it.each(extremos)("abarca %s", (_nombre, lat, lng) => {
    expect(dentroDelPeru(lat, lng)).toBe(true);
  });

  const ciudades: Array<[string, number, number]> = [
    ["Lima", -12.05, -77.04],
    ["Iquitos", -3.75, -73.25],
    ["Arequipa", -16.4, -71.54],
    ["Cusco", -13.53, -71.97],
    ["Piura", -5.19, -80.63],
  ];

  it.each(ciudades)("contiene %s", (_nombre, lat, lng) => {
    expect(dentroDelPeru(lat, lng)).toBe(true);
  });

  const fuera: Array<[string, number, number]> = [
    ["Bogotá", 4.71, -74.07],
    ["Santiago de Chile", -33.45, -70.67],
    ["Brasilia", -15.79, -47.88],
  ];

  it.each(fuera)("no se estira hasta %s", (_nombre, lat, lng) => {
    expect(dentroDelPeru(lat, lng)).toBe(false);
  });

  it("no encuadra tanto que el país quede diminuto", () => {
    // El país mide ~18.4° de alto y ~12.7° de ancho. Un margen generoso de más
    // haría que el mapa fuese sobre todo océano y selva brasileña.
    const [[sur, oeste], [norte, este]] = PERU_BOUNDS;
    expect(norte - sur).toBeLessThan(21);
    expect(este - oeste).toBeLessThan(15);
  });

  it("está en el formato que espera Leaflet: [[sur, oeste], [norte, este]]", () => {
    const [[sur, oeste], [norte, este]] = PERU_BOUNDS;
    expect(sur).toBeLessThan(norte);
    expect(oeste).toBeLessThan(este);
  });
});
