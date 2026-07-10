import { describe, it, expect } from "vitest";
import {
  priceFor, priceForDuration, creditsForDuration, solesToCredits,
  extrasTotal, splitIgv, IGV_RATE, DEFAULT_SETTINGS,
} from "@/lib/pricing";

// ─────────────────────────────────────────────────────────────────────────────
// FUENTE DE VERDAD: "2026 06 18 Lista_Precios_CORP LozanoCheffer OK.xlsx".
// Este test fija que el motor de precios reproduzca EXACTAMENTE el Excel.
// Si alguien cambia base/descuentos/adicionales y se sale del Excel, falla aquí.
// ─────────────────────────────────────────────────────────────────────────────

// Matriz oficial del Excel (hoja "Lista de Precios"), soles con IGV, 2 decimales.
// Filas = cantidad de avisos (1..10); columnas = 7 / 15 / 30 / 60 / 90 días.
const EXCEL: Record<number, [number, number, number, number, number]> = {
  1: [16.14, 27.76, 48.30, 85.01, 113.49],
  2: [30.34, 52.19, 90.81, 159.83, 213.37],
  3: [42.78, 73.59, 128.04, 225.36, 300.85],
  4: [53.62, 92.23, 160.48, 282.45, 377.07],
  5: [63.01, 108.37, 188.57, 331.88, 443.05],
  6: [71.07, 122.24, 212.70, 374.36, 499.76],
  7: [77.94, 134.06, 233.26, 410.54, 548.08],
  8: [83.73, 144.02, 250.59, 441.04, 588.79],
  9: [88.55, 152.30, 265.00, 466.40, 622.64],
  10: [92.48, 159.07, 276.78, 487.13, 650.32],
};
const DIAS = [7, 15, 30, 60, 90] as const;

describe("Excel — parámetros base (Supuestos)", () => {
  it("precio base 1 aviso × 7 días = 16.14 (con IGV 18%)", () => {
    expect(DEFAULT_SETTINGS.base).toBe(16.14);
    // 13.677966 sin IGV × 1.18 = 16.14
    expect(Math.round((16.14 / 1.18) * 1.18 * 100) / 100).toBe(16.14);
  });
  it("descuento por cantidad = 6% acumulativo por aviso (niveles 2..10)", () => {
    for (let n = 2; n <= 10; n++) expect(DEFAULT_SETTINGS.descCantidad?.[n]).toBe(0.06);
  });
  it("descuentos por días = 14 / 13 / 12 / 11 %", () => {
    expect(DEFAULT_SETTINGS.saltos).toMatchObject({ 15: 0.14, 30: 0.13, 60: 0.12, 90: 0.11 });
  });
  it("IGV = 18% y separa el total (16.14 → 13.68 + 2.46), como el Excel", () => {
    expect(IGV_RATE).toBe(0.18);
    expect(splitIgv(16.14)).toEqual({ subtotal: 13.68, igv: 2.46 });
  });
  it("adicionales del Excel: 500KB/Urgente/Destacado = 5; 100KB y Confidencial = gratis", () => {
    expect(DEFAULT_SETTINGS.extras).toMatchObject({
      img100: 0, pdf100: 0, img500: 5, pdf500: 5, urgente: 5, destacado: 5, confidencial: 0,
    });
    // Un adicional de pago suma 5 soles = 5 créditos.
    expect(extrasTotal({ urgente: true }, DEFAULT_SETTINGS)).toBe(5);
    expect(solesToCredits(5)).toBe(5);
  });
});

describe("Excel — matriz de precios completa (10 avisos × 5 duraciones)", () => {
  it("las 50 celdas del motor coinciden al centavo con el Excel", () => {
    for (let n = 1; n <= 10; n++) {
      DIAS.forEach((dias, i) => {
        expect(priceFor(n, dias, DEFAULT_SETTINGS)).toBeCloseTo(EXCEL[n][i], 2);
      });
    }
  });

  it("el costo en créditos es idéntico al precio en soles (1 crédito = 1 sol)", () => {
    for (let n = 1; n <= 10; n++) {
      DIAS.forEach((dias) => {
        expect(creditsForDuration(n, dias, DEFAULT_SETTINGS))
          .toBe(priceForDuration(n, dias, DEFAULT_SETTINGS));
      });
    }
  });
});
