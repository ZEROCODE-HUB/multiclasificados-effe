import { describe, it, expect, vi } from "vitest";

// promotions.ts importa supabase; lo mockeamos (los helpers probados son puros).
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  priceFor, priceForDuration, solesToCredits, creditsForDuration, CREDIT_MULTIPLIER,
  DEFAULT_SETTINGS, type PricingSettings,
} from "@/lib/pricing";
import { bestPromoForCategory, applyDiscount, type Promotion } from "@/lib/promotions";

// Settings con descuento por cantidad DISTINTO por nivel (no uniforme):
// nivel 2 = 10%, nivel 3 = 50%. Base 100, sin saltos ni extras.
const S: PricingSettings = {
  base: 100,
  descPorAviso: 0,
  descCantidad: [0, 0, 0.1, 0.5],
  saltos: { 15: 0, 30: 0, 60: 0, 90: 0 },
  extras: { img100: 0, img500: 0, pdf100: 0, pdf500: 0, urgente: 0, destacado: 0, confidencial: 0 },
};

describe("Req 3 — descuento por cantidad REAL (por nivel, no promediado)", () => {
  it("1 aviso = precio base (sin descuento)", () => {
    expect(priceFor(1, 7, S)).toBe(100);
  });
  it("2 avisos aplican el % del nivel 2 (10%)", () => {
    // 100*2 * (1-0.10) = 180
    expect(priceFor(2, 7, S)).toBe(180);
  });
  it("3 avisos aplican nivel 2 (10%) y nivel 3 (50%) de forma independiente", () => {
    // 100*3 * (1-0.10) * (1-0.50) = 135  → prueba que cada nivel usa su propio %
    expect(priceFor(3, 7, S)).toBe(135);
  });
});

describe("Req 2 — helpers de promoción", () => {
  const promos: Promotion[] = [
    { id: "1", name: "Madre", discount_pct: 50, starts_at: "", ends_at: "", category_ids: ["productos"], is_active: true },
    { id: "2", name: "General", discount_pct: 20, starts_at: "", ends_at: "", category_ids: [], is_active: true },
    { id: "3", name: "Autos", discount_pct: 15, starts_at: "", ends_at: "", category_ids: ["vehiculos"], is_active: true },
  ];

  it("elige el mayor descuento aplicable a la categoría", () => {
    // productos: aplica "Madre" (50) y "General" (todas, 20) → gana 50
    expect(bestPromoForCategory(promos, "productos")?.discount_pct).toBe(50);
  });
  it("usa la promo 'todas las categorías' cuando no hay específica", () => {
    // empleos: solo "General" (categoría vacía = todas)
    expect(bestPromoForCategory(promos, "empleos")?.discount_pct).toBe(20);
  });
  it("aplica el descuento al costo (caso Día de la Madre: 100 → 50)", () => {
    expect(applyDiscount(100, 50)).toBe(50);
    expect(applyDiscount(16.14, 50)).toBe(8.07);
  });
});

describe("Créditos — 1 crédito = 1 sol", () => {
  it("el crédito vale exactamente un sol", () => {
    expect(CREDIT_MULTIPLIER).toBe(1);
    expect(solesToCredits(16.14)).toBe(16.14);
  });

  it("el costo en créditos es el precio en soles, al céntimo", () => {
    // Si el saldo no cuadrara con la boleta, el usuario pagaría una cosa y
    // recibiría otra: recorre toda la matriz del Excel + promociones.
    for (let n = 1; n <= 10; n++) {
      for (const dias of [7, 15, 30, 60, 90] as const) {
        const soles = priceForDuration(n, dias, DEFAULT_SETTINGS);
        expect(creditsForDuration(n, dias, DEFAULT_SETTINGS)).toBe(soles);
        for (let pct = 10; pct <= 90; pct += 10) {
          const conPromo = applyDiscount(soles, pct);
          expect(solesToCredits(conPromo)).toBe(conPromo);
        }
      }
    }
  });

  it("nunca aparece un tercer decimal (las columnas de la BD son numeric(12,2))", () => {
    const dosDecimales = (v: number) => expect(Math.round(v * 100) / 100).toBe(v);
    dosDecimales(creditsForDuration(1, 7, DEFAULT_SETTINGS));
    for (let pct = 10; pct <= 90; pct += 10) {
      dosDecimales(solesToCredits(applyDiscount(priceFor(1, 7, DEFAULT_SETTINGS), pct)));
    }
  });

  it("el estándar 1×7 cuesta lo mismo en soles que en créditos", () => {
    expect(creditsForDuration(1, 7, DEFAULT_SETTINGS)).toBe(16.14);
  });
});
