import { describe, it, expect } from "vitest";
import { variacionPct, formatVariacion } from "@/lib/admin";

// Las tarjetas del panel enseñaban porcentajes escritos a mano ("+3.2%") que no
// cambiaban nunca. Ahora se calculan; lo que se prueba aquí es que el cálculo no
// produzca los números absurdos típicos de una división mal defendida.

describe("variacionPct", () => {
  it("calcula la subida y la baja con un decimal", () => {
    expect(variacionPct(151, 139)).toBe(8.6);   // +8.63… → 8.6
    expect(variacionPct(120, 150)).toBe(-20);
    expect(variacionPct(200, 100)).toBe(100);
  });

  it("sin cambios devuelve 0, no un residuo de coma flotante", () => {
    expect(variacionPct(105, 105)).toBe(0);
    expect(variacionPct(145.77, 145.77)).toBe(0);
  });

  it("desde cero no hay porcentaje: sería +∞%", () => {
    expect(variacionPct(105, 0)).toBeNull();
    expect(variacionPct(0, 0)).toBeNull();
  });

  it("sin dato previo no se inventa nada", () => {
    expect(variacionPct(105, null)).toBeNull();
    expect(variacionPct(105, undefined)).toBeNull();
  });

  it("aguanta valores no finitos sin devolver NaN", () => {
    expect(variacionPct(Number.NaN, 10)).toBeNull();
    expect(variacionPct(10, Number.NaN)).toBeNull();
    expect(variacionPct(10, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("redondea a un decimal (lo que se pinta en la tarjeta)", () => {
    // 145.77 desde 130 → 12.130…%
    expect(variacionPct(145.77, 130)).toBe(12.1);
    // Caídas también a un decimal.
    expect(variacionPct(29, 34)).toBe(-14.7);
  });
});

// En una plataforma joven las variaciones son enormes: en producción los
// usuarios pasaron de 17 a 105 en 30 días (+518%) y los reportes de 2 a 29
// (+1350%). La tarjeta mide ~150px, así que hay que escribirlos de forma que
// quepan y se entiendan.
describe("formatVariacion", () => {
  it("por debajo del 100% conserva el decimal", () => {
    expect(formatVariacion(8.6)).toBe("+8.6%");
    expect(formatVariacion(-14.7)).toBe("-14.7%");
    expect(formatVariacion(0)).toBe("0%");
  });

  it("a partir del 100% el decimal sobra", () => {
    expect(formatVariacion(517.6)).toBe("+518%");
    expect(formatVariacion(406.7)).toBe("+407%");
  });

  it("multiplicar por más de diez se dice multiplicando, no en porcentaje", () => {
    // 2 → 29 reportes. "+1350%" no cabe y se lee peor que "×14,5".
    expect(formatVariacion(1350)).toBe("×14.5");
    expect(formatVariacion(900)).toBe("+900%");
    expect(formatVariacion(1000)).toBe("×11.0");
  });

  it("nunca produce cadenas larguísimas", () => {
    for (const pct of [0, 8.6, -99.9, 100, 999.9, 1000, 25000]) {
      expect(formatVariacion(pct).length, `pct ${pct}`).toBeLessThanOrEqual(8);
    }
  });
});
