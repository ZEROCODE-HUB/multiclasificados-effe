import { describe, it, expect } from "vitest";
import { pageNumbers } from "@/pages/SearchPage";

// Los números de página: con pocas se muestran todas; con muchas se recorta con
// "…" pero siempre se ven la primera, la última y la actual.
describe("pageNumbers", () => {
  it("hasta 7 páginas: se muestran todas sin recortar", () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("muchas páginas al inicio: recorta solo al final", () => {
    expect(pageNumbers(1, 20)).toEqual([1, 2, "…", 20]);
  });

  it("muchas páginas en el medio: recorta por ambos lados alrededor de la actual", () => {
    expect(pageNumbers(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
  });

  it("muchas páginas al final: recorta solo al inicio", () => {
    expect(pageNumbers(20, 20)).toEqual([1, "…", 19, 20]);
  });
});
