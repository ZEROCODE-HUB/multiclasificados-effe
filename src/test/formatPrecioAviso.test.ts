import { describe, it, expect } from "vitest";
import { formatPrecioAviso, formatSoles, formatCredits } from "@/lib/pricing";

// El precio de un aviso se pintaba en seis componentes, cada uno con su propia
// copia de la cuenta: el mismo aviso se veía "S/ 120,000" en la tarjeta y
// "S/ 120,000.00" en el panel. Estos casos fijan el formato único.
describe("formatPrecioAviso", () => {
  it("siempre dos decimales y separador de miles", () => {
    expect(formatPrecioAviso(1234.5, "PEN")).toBe("S/ 1,234.50");
    expect(formatPrecioAviso(120000, "PEN")).toBe("S/ 120,000.00");
    expect(formatPrecioAviso(9.9, "PEN")).toBe("S/ 9.90");
  });

  it("los dólares llevan su propia sigla, sin abreviar", () => {
    expect(formatPrecioAviso(2, "USD")).toBe("US$ 2.00");
    expect(formatPrecioAviso(15000, "USD")).toBe("US$ 15,000.00");
  });

  it("sin precio, el aviso sale 'a convenir'", () => {
    expect(formatPrecioAviso(0, "PEN")).toBe("Precio a convenir");
    expect(formatPrecioAviso(-5, "PEN")).toBe("Precio a convenir");
    expect(formatPrecioAviso(NaN, "USD")).toBe("Precio a convenir");
  });

  it("nunca escribe la sigla con punto", () => {
    for (const v of [0, 1, 1000, 120000.55]) {
      expect(formatPrecioAviso(v, "PEN")).not.toContain("S/.");
      expect(formatSoles(v)).not.toContain("S/.");
      expect(formatCredits(v)).not.toContain("S/.");
    }
  });
});
