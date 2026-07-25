// @vitest-environment node
import { describe, it, expect } from "vitest";
import { formatCompactPrice } from "@/lib/pricing";

// Bug reportado: en el pin del mapa "US$ 2" se veía como "US$ 0K" porque se
// dividía siempre entre 1000. El formateador compacto abrevia SOLO montos
// grandes y muestra completos los chicos.
describe("formatCompactPrice", () => {
  it("montos chicos se muestran completos (no '0K')", () => {
    expect(formatCompactPrice(2, "USD")).toBe("US$ 2");
    expect(formatCompactPrice(230, "PEN")).toBe("S/ 230");
    expect(formatCompactPrice(999, "USD")).toBe("US$ 999");
    expect(formatCompactPrice(4000, "PEN")).toBe("S/ 4,000");
  });

  it("desde 10 000 abrevia con 'K'", () => {
    expect(formatCompactPrice(20000, "PEN")).toBe("S/ 20K");
    expect(formatCompactPrice(250000, "USD")).toBe("US$ 250K");
  });

  it("desde 1 000 000 abrevia con 'M'", () => {
    expect(formatCompactPrice(2_500_000, "PEN")).toBe("S/ 2.5M");
    expect(formatCompactPrice(1_000_000, "USD")).toBe("US$ 1.0M");
  });

  it("0 y no-finitos no rompen", () => {
    expect(formatCompactPrice(0, "USD")).toBe("US$ 0");
    expect(formatCompactPrice(NaN, "PEN")).toBe("S/ 0");
  });
});
