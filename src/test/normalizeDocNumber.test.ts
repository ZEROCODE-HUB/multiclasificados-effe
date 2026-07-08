import { describe, it, expect } from "vitest";
import { normalizeDocNumber } from "@/lib/verifyDoc";

describe("normalizeDocNumber — filtra primero, recorta después", () => {
  it("un DNI pegado con espacio conserva los 8 dígitos", () => {
    // El bug: con maxLength={8} el navegador cortaba "4444 5555" a "4444 555"
    // y el filtro dejaba "4444555" (7). Nunca verificaba.
    expect(normalizeDocNumber("4444 5555", 8)).toBe("44445555");
  });

  it("tolera guiones, puntos y espacios en cualquier posición", () => {
    expect(normalizeDocNumber("44-44-5555", 8)).toBe("44445555");
    expect(normalizeDocNumber(" 4444.5555 ", 8)).toBe("44445555");
  });

  it("un RUC pegado con espacios conserva los 11 dígitos", () => {
    expect(normalizeDocNumber("20 131 312 955", 11)).toBe("20131312955");
  });

  it("recorta al máximo, ya sobre dígitos", () => {
    expect(normalizeDocNumber("123456789", 8)).toBe("12345678");
    expect(normalizeDocNumber("4444 5555 9999", 8)).toBe("44445555");
  });

  it("descarta letras y símbolos", () => {
    expect(normalizeDocNumber("44a44b5555xyz", 8)).toBe("44445555");
    expect(normalizeDocNumber("abc", 8)).toBe("");
  });

  it("no rompe con vacío", () => {
    expect(normalizeDocNumber("", 8)).toBe("");
  });
});
