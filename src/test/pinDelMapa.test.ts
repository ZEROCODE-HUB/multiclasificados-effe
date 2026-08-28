import { describe, it, expect, beforeAll } from "vitest";
import { pinDePrecio, marcarPinActivo, pinDeGrupo, pinAnclado, iconoDePrecio, iconoDeGrupo } from "@/components/mapIcons";

/**
 * EL PIN NO PUEDE ANIMAR SU POSICION.
 *
 * El fallo que se persiguio durante cinco intentos: mueves el mapa, los pines
 * lo acompanan bien, y AL SOLTAR "vuelven a su posicion anterior y luego se
 * ponen en la correcta".
 *
 * No lo movia nadie. Google coloca cada marcador con un `transform`: mientras
 * se arrastra mueve el CONTENEDOR de los pines —el transform de cada uno no
 * cambia, por eso acompanan bien—, pero al soltar recoloca cada pin con su
 * propio transform. Y el pin llevaba `transition-all`, que anima TAMBIEN esa
 * propiedad: se veia viajando desde donde estaba hasta donde debia estar.
 *
 * Por eso no aparecia en ningun registro del mapa. No era un movimiento: era
 * la transicion dibujandolo.
 */

describe("el pin de precio", () => {
  it("NO usa transition-all: animaria tambien su posicion", () => {
    const el = pinDePrecio("S/ 100", false);
    expect(el.className).not.toContain("transition-all");
  });

  it("pero si anima el color, para que el resaltado no sea brusco", () => {
    expect(pinDePrecio("S/ 100", false).className).toContain("transition-colors");
  });

  it("se resalta cambiando el color, no el tamano de la caja", () => {
    const el = pinDePrecio("S/ 100", false);
    expect(el.className).toContain("bg-secondary");
    marcarPinActivo(el, true);
    expect(el.className).toContain("bg-primary");
    marcarPinActivo(el, false);
    expect(el.className).toContain("bg-secondary");
  });

  it("marcar dos veces lo mismo no reescribe las clases", () => {
    // Escribir la misma cadena fuerza un recalculo de estilos por marcador, y
    // se recorren todos en cada cambio de seleccion.
    const el = pinDePrecio("S/ 100", true);
    const antes = el.className;
    marcarPinActivo(el, true);
    expect(el.className).toBe(antes);
  });
});

describe("los otros pines tampoco animan su posicion", () => {
  it("el de grupo", () => {
    expect(pinDeGrupo(5).className).not.toContain("transition-all");
  });

  it("el anclado de la ficha", () => {
    expect(pinAnclado("S/ 100").className).not.toContain("transition-all");
  });
});

/**
 * LOS PINES DEL BUSCADOR, YA COMO IMAGEN.
 *
 * Un `AdvancedMarkerElement` lleva un nodo del DOM por marcador, y Google lo
 * recoloca al terminar cada gesto sobre el mapa. Ese reposicionado era el salto:
 * al soltar, los pines aparecian un instante en su sitio anterior. Con un icono
 * no hay nodo que recolocar.
 *
 * Se descartaron antes, una por una y con pruebas, las otras causas: el
 * agrupador (comparando con `?agrupar=no`), el codigo que mueve el mapa (dos
 * trazas en produccion sin una sola orden nuestra), la transicion CSS del pin y
 * el renderizado vectorial (ya estaba en raster).
 */
describe("los pines del buscador son imagenes", () => {
  beforeAll(() => {
    (globalThis as unknown as { google: unknown }).google = {
      maps: {
        Size: class { constructor(public width: number, public height: number) {} },
        Point: class { constructor(public x: number, public y: number) {} },
      },
    };
  });

  it("el precio viaja como SVG, no como nodo del DOM", () => {
    const icono = iconoDePrecio("S/ 100", false);
    expect(icono.url).toMatch(/^data:image\/svg\+xml/);
  });

  it("el precio se lee dentro del icono", () => {
    expect(decodeURIComponent(iconoDePrecio("S/ 1,250", false).url)).toContain("S/ 1,250");
  });

  it("el activo va en otro color", () => {
    const normal = decodeURIComponent(iconoDePrecio("S/ 100", false).url);
    const activo = decodeURIComponent(iconoDePrecio("S/ 100", true).url);
    expect(normal).toContain("#bd4e05");
    expect(activo).toContain("#162950");
  });

  it("se ancla por abajo, para que la burbuja quede encima del punto", () => {
    const i = iconoDePrecio("S/ 100", false) as unknown as { anchor: { x: number; y: number } };
    expect(i.anchor.y).toBe(22);
  });

  it("un precio largo ensancha la burbuja: si no, se recortaria", () => {
    // Un SVG no sabe medir su propio texto, asi que el ancho se calcula.
    const corto = iconoDePrecio("S/ 8", false) as unknown as { scaledSize: { width: number } };
    const largo = iconoDePrecio("US$ 1,250,000.00", false) as unknown as { scaledSize: { width: number } };
    expect(largo.scaledSize.width).toBeGreaterThan(corto.scaledSize.width);
  });

  it("escapa lo que va dentro del SVG", () => {
    expect(decodeURIComponent(iconoDePrecio("a<b>&c", false).url)).toContain("a&lt;b&gt;&amp;c");
  });

  it("el grupo crece con la cantidad", () => {
    const pocos = iconoDeGrupo(5) as unknown as { scaledSize: { width: number } };
    const muchos = iconoDeGrupo(80) as unknown as { scaledSize: { width: number } };
    expect(muchos.scaledSize.width).toBeGreaterThan(pocos.scaledSize.width);
    expect(decodeURIComponent(iconoDeGrupo(42).url)).toContain(">42<");
  });
});
