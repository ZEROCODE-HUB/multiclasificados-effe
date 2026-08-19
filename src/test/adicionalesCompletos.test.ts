import { describe, it, expect } from "vitest";
import { adicionalesQueFaltan, resumenDeFaltantes } from "@/lib/adicionalesCompletos";
import { faltaEnElAviso } from "@/lib/avisoCompleto";

/**
 * Los adicionales se cobran por CONTRATARLOS, no por usarlos: publicar con
 * tres huecos de video vacíos son tres videos pagados. En un aviso de 30 días
 * a S/ 5 por día, S/ 450 por nada.
 */
describe("subir lo que se contrató", () => {
  const nada = { imagenesExtra: 0, tienePdf: false, videos: 0 };

  it("sin adicionales no hay nada que reclamar", () => {
    expect(adicionalesQueFaltan({}, nada)).toEqual([]);
    expect(adicionalesQueFaltan(null, nada)).toEqual([]);
  });

  it("3 videos contratados y ninguno subido", () => {
    const [falta] = adicionalesQueFaltan({ video20: 3 }, nada);
    expect(falta.clave).toBe("video20");
    expect(falta.mensaje).toContain("3 videos");
    expect(falta.mensaje).toContain("subiste 0");
  });

  it("3 contratados y 1 subido: reclama los 2 que faltan", () => {
    const [falta] = adicionalesQueFaltan({ video20: 3 }, { ...nada, videos: 1 });
    expect(falta.mensaje).toContain("2 videos más");
  });

  it("todo subido: se puede publicar", () => {
    expect(adicionalesQueFaltan(
      { video20: 2, img500: 3, pdf500: 1 },
      { imagenesExtra: 3, tienePdf: true, videos: 2 },
    )).toEqual([]);
  });

  it("subir de más tampoco bloquea: lo que importa es que no falte", () => {
    expect(adicionalesQueFaltan({ video20: 1 }, { ...nada, videos: 2 })).toEqual([]);
  });

  it("vale para los tres adicionales con archivo", () => {
    const faltan = adicionalesQueFaltan({ img500: 2, pdf500: 1, video20: 1 }, nada);
    expect(faltan.map((f) => f.clave)).toEqual(["img500", "pdf500", "video20"]);
  });

  it("urgente, destacado y confidencial no exigen subir nada", () => {
    expect(adicionalesQueFaltan(
      { urgente: 1, destacado: 1, confidencial: 1 }, nada,
    )).toEqual([]);
  });

  it("el singular y el plural están cuidados: se lee, no se descifra", () => {
    const [uno] = adicionalesQueFaltan({ video20: 1 }, nada);
    expect(uno.mensaje).toContain("1 video ");
    expect(uno.mensaje).not.toContain("1 videos");

    const [imgs] = adicionalesQueFaltan({ img500: 1 }, nada);
    expect(imgs.mensaje).toContain("1 imagen adicional");
  });

  it("con varios faltantes el resumen no encadena tres frases", () => {
    const faltan = adicionalesQueFaltan({ img500: 1, video20: 1 }, nada);
    expect(resumenDeFaltantes(faltan)).toContain("2 adicionales");
    // Y con uno solo se dice exactamente cuál, que es más útil.
    expect(resumenDeFaltantes([faltan[0]])).toBe(faltan[0].mensaje);
  });
});

/**
 * Guardar un borrador solo exige título y categoría —así debe ser—, pero
 * publicarlo exige lo mismo que el formulario. Antes el camino "publicar desde
 * Borradores" se saltaba las reglas enteras y sacaba al público avisos sin
 * descripción, cobrándolos.
 */
describe("el aviso está listo para publicarse", () => {
  const completo = {
    category: "tecnologia",
    title: "Laptop",
    description: "En buen estado",
    price: 1500,
    location: "Lima",
    lat: -12.04,
    lng: -77.03,
    country: "PE",
  };

  it("un aviso completo pasa", () => {
    expect(faltaEnElAviso(completo)).toBeNull();
  });

  it("sin descripción no se publica", () => {
    expect(faltaEnElAviso({ ...completo, description: "   " })?.campo).toBe("descripcion");
  });

  it("sin categoría ni título tampoco", () => {
    expect(faltaEnElAviso({ ...completo, category: "" })?.campo).toBe("categoria");
    expect(faltaEnElAviso({ ...completo, title: "" })?.campo).toBe("titulo");
  });

  it("un precio de 0 vale: sale como «a convenir»", () => {
    expect(faltaEnElAviso({ ...completo, price: 0 })).toBeNull();
  });

  it("un precio negativo no", () => {
    expect(faltaEnElAviso({ ...completo, price: -5 })?.campo).toBe("precio");
  });

  it("en empleos el sueldo puede faltar", () => {
    expect(faltaEnElAviso({ ...completo, category: "empleos", price: null })).toBeNull();
    expect(faltaEnElAviso({ ...completo, price: null })?.campo).toBe("precio");
  });

  it("dentro del Perú hace falta el punto en el mapa", () => {
    expect(faltaEnElAviso({ ...completo, lat: null, lng: null })?.campo).toBe("ubicacion");
  });

  it("fuera del Perú basta el texto: no hay mapa de departamentos", () => {
    const enChile = { ...completo, country: "CL", lat: null, lng: null, location: "Santiago" };
    expect(faltaEnElAviso(enChile)).toBeNull();
    expect(faltaEnElAviso({ ...enChile, location: "" })?.campo).toBe("ubicacion");
  });

  it("se reclama el primer fallo en el orden del formulario, no uno cualquiera", () => {
    // Si falta todo, lo primero que se pide es la categoría: es el orden en que
    // el usuario los ve, y saltar al último desorienta.
    const vacio = { category: "", title: "", description: "", price: null };
    expect(faltaEnElAviso(vacio)?.campo).toBe("categoria");
  });
});
