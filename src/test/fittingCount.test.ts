// @vitest-environment node
import { describe, it, expect } from "vitest";
import { columnsThatFit } from "@/hooks/useFittingCount";

// Las secciones de avisos de la portada muestran UNA fila: los que entren. Para
// eso hay que repetir en JS la cuenta que hace CSS con
// `repeat(auto-fill, minmax(230px, 1fr))`; si las dos no coinciden, aparece una
// segunda fila a medias, que es justo lo que se quería quitar.

const MIN = 230;
const GAP = 16;

describe("columnsThatFit", () => {
  it("coincide con lo que reparte CSS en los anchos medidos en el navegador", () => {
    // Ancho del contenedor = viewport menos su relleno. Las secciones llevan
    // `container px-4`, y la utilidad `px-4` (16 px por lado) gana al padding
    // del componente `container`; de ahí los 32 px, no 64. Las columnas
    // esperadas son las que se midieron en el navegador real.
    expect(columnsThatFit(800 - 32, MIN, GAP)).toBe(3);
    expect(columnsThatFit(1280 - 32, MIN, GAP)).toBe(5);
    expect(columnsThatFit(1536 - 32, MIN, GAP)).toBe(6);
    expect(columnsThatFit(2000 - 32, MIN, GAP)).toBe(8);
  });

  it("el gap cuenta: n columnas ocupan n*min + (n-1)*gap", () => {
    // 3 columnas justas: 3*230 + 2*16 = 722.
    expect(columnsThatFit(722, MIN, GAP)).toBe(3);
    // Un píxel menos y ya no cabe la tercera.
    expect(columnsThatFit(721, MIN, GAP)).toBe(2);
  });

  it("nunca devuelve menos de una columna", () => {
    expect(columnsThatFit(100, MIN, GAP)).toBe(1);
    expect(columnsThatFit(0, MIN, GAP)).toBe(1);
    expect(columnsThatFit(-50, MIN, GAP)).toBe(1);
    expect(columnsThatFit(Number.NaN, MIN, GAP)).toBe(1);
  });
});
