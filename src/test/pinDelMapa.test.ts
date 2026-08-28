import { describe, it, expect } from "vitest";
import { pinDePrecio, marcarPinActivo, pinDeGrupo, pinAnclado } from "@/components/mapIcons";

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
