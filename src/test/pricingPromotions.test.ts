import { describe, it, expect, vi } from "vitest";

// promotions.ts importa supabase; lo mockeamos (los helpers probados son puros).
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { priceFor, type PricingSettings } from "@/lib/pricing";
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
