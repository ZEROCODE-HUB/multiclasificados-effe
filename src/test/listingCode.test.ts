// El código que se le enseña al usuario ("EFFE-…") y que dicta por teléfono.
// Se calcula en dos sitios de la ficha y TIENEN que coincidir, así que la
// función vive aparte y se prueba aquí.
import { describe, it, expect } from "vitest";
import { codigoDeAviso } from "@/lib/listingCode";

describe("codigoDeAviso", () => {
  it("de un UUID saca 8 caracteres legibles, no el UUID entero", () => {
    // Este es el caso que motivó el cambio: se veía
    // "EFFE-01e6d187-aa3f-448d-802f-a69c17900d0c" en la ficha.
    expect(codigoDeAviso("01e6d187-aa3f-448d-802f-a69c17900d0c")).toBe("EFFE-01E6D187");
  });

  it("nunca deja guiones dentro del código", () => {
    // Un guión sobrante lo haría ilegible al dictarlo ("EFFE-01E6-D18").
    const codigo = codigoDeAviso("01e6d187-aa3f-448d-802f-a69c17900d0c");
    expect(codigo.slice("EFFE-".length)).not.toContain("-");
  });

  it("es corto: 13 caracteres en total, cabe en una línea", () => {
    expect(codigoDeAviso("01e6d187-aa3f-448d-802f-a69c17900d0c")).toHaveLength(13);
  });

  it("los ids cortos de los avisos de demostración conservan su código de siempre", () => {
    // Antes se rellenaba con ceros hasta 6; esos avisos no deben cambiar.
    expect(codigoDeAviso("1")).toBe("EFFE-000001");
    expect(codigoDeAviso("42")).toBe("EFFE-000042");
  });

  it("dos avisos distintos no comparten código", () => {
    const a = codigoDeAviso("01e6d187-aa3f-448d-802f-a69c17900d0c");
    const b = codigoDeAviso("01e6d188-aa3f-448d-802f-a69c17900d0c");
    expect(a).not.toBe(b);
  });

  it("dos avisos que solo se diferencian DESPUÉS del octavo carácter sí colisionan (asumido)", () => {
    // Documenta el compromiso: el código es para identificarse en una llamada,
    // no una clave. La búsqueda del panel sigue usando el id completo.
    const a = codigoDeAviso("01e6d187-aa3f-448d-802f-a69c17900d0c");
    const b = codigoDeAviso("01e6d187-bbbb-448d-802f-a69c17900d0c");
    expect(a).toBe(b);
  });

  it("no depende de las mayúsculas del id", () => {
    expect(codigoDeAviso("01E6D187-AA3F-448D-802F-A69C17900D0C")).toBe(
      codigoDeAviso("01e6d187-aa3f-448d-802f-a69c17900d0c"),
    );
  });
});
