import { describe, it, expect } from "vitest";
import { enlaceDeMapaExterno, enlaceDeRutaExterna } from "@/lib/mapaExterno";

/**
 * Abrir la ubicación del aviso en la aplicación de mapas del teléfono (punto 06).
 *
 * El mapa de la ficha sirve para situarse y nada más: no da indicaciones, no
 * calcula la ruta y no sigue al usuario por la calle. Quien va a ver un
 * departamento quiere justo eso, y hasta ahora tenía que copiar el nombre del
 * sitio a mano en otra aplicación.
 */

const LIMA = { lat: -12.046374, lng: -77.042793 };

describe("el enlace del mapa", () => {
  it("usa la forma documentada de Google, no una URL interna suya", () => {
    // `?api=1&query=` es la que Google promete no romper, y la que Android e
    // iOS reconocen para ofrecer abrir la app. Las otras que circulan
    // (`/maps?q=`, `/maps/place/`) funcionan pero no tienen ninguna garantía.
    const url = enlaceDeMapaExterno(LIMA.lat, LIMA.lng)!;
    expect(url).toContain("google.com/maps/search/?api=1&query=");
    expect(url).toContain("-12.046374");
    expect(url).toContain("-77.042793");
  });

  it("redondea a seis decimales", () => {
    // Son unos 11 cm, de sobra para un portal. Sin esto, un `toString()` suelta
    // "-12.046374000000001" en el enlace.
    // El literal se escribe a partir de una cuenta y no a mano: escrito tal
    // cual, TypeScript avisa de que pierde precisión al leerlo.
    const conCola = -12.046374 - 1.5e-15;
    expect(enlaceDeMapaExterno(conCola, -77.042793)!).not.toContain("0000001");
  });

  it("el de indicaciones va sin origen", () => {
    // Lo pone la aplicación de mapas con la ubicación actual del teléfono, que
    // es lo correcto: nosotros no la tenemos y tampoco hace falta pedirla.
    const url = enlaceDeRutaExterna(LIMA.lat, LIMA.lng)!;
    expect(url).toContain("/maps/dir/?api=1&destination=");
    expect(url).not.toContain("origin=");
  });
});

describe("una coordenada que no es un sitio no genera enlace", () => {
  it.each([
    ["sin coordenada", NaN, NaN],
    ["latitud imposible", 91, 0],
    ["longitud imposible", 0, 181],
    ["infinito", Infinity, 0],
  ])("%s", (_caso, lat, lng) => {
    // Google abriría el mapa del mundo entero y el usuario creería que el aviso
    // está en medio del Atlántico. Sin enlace, el botón sencillamente no actúa.
    expect(enlaceDeMapaExterno(lat, lng)).toBeNull();
    expect(enlaceDeRutaExterna(lat, lng)).toBeNull();
  });

  it("pero el 0,0 de verdad sí es válido como coordenada", () => {
    // Es un punto real. Descartarlo por "parece vacío" sería adivinar.
    expect(enlaceDeMapaExterno(0, 0)).toContain("query=0.000000%2C0.000000");
  });
});
