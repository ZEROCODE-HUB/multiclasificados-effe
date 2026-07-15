// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as front from "@/lib/pricing";
import * as shared from "../../supabase/functions/_shared/pricing.ts";

/**
 * El servidor (create-payment) RECALCULA el monto de la compra con
 * supabase/functions/_shared/pricing.ts para no confiar en el precio que envía
 * el cliente. Ese módulo es una copia del núcleo de src/lib/pricing.ts; este
 * test garantiza que NUNCA divergen: si alguien cambia una fórmula en un lado y
 * no en el otro, el cliente cobraría un monto distinto al que valida el backend.
 */

const settings: front.PricingSettings = front.DEFAULT_SETTINGS;
const DURATIONS: front.DurationDays[] = [3, 7, 15, 30, 60, 90];

describe("paridad front (src/lib/pricing) ↔ shared (_shared/pricing)", () => {
  it("priceForDuration coincide en toda la grilla n=1..10 × duraciones", () => {
    for (let n = 1; n <= 10; n++) {
      for (const d of DURATIONS) {
        expect(shared.priceForDuration(n, d, settings)).toBe(front.priceForDuration(n, d, settings));
      }
    }
  });

  it("extrasTotal coincide para las combinaciones de adicionales", () => {
    const combos: front.ExtrasSelection[] = [
      {},
      { img500: true },
      { pdf500: true, urgente: true },
      { destacado: true, urgente: true, img500: true },
      { img500: 3 },
    ];
    for (const sel of combos) {
      expect(shared.extrasTotal(sel, settings)).toBe(front.extrasTotal(sel, settings));
    }
  });

  it("splitIgv y solesToCredits coinciden", () => {
    for (const total of [16.14, 50, 85.5, 160.99, 1234.56]) {
      expect(shared.splitIgv(total)).toEqual(front.splitIgv(total));
      expect(shared.solesToCredits(total)).toBe(front.solesToCredits(total));
    }
    expect(shared.IGV_RATE).toBe(front.IGV_RATE);
  });

  it("totalPrice (base + extras) coincide", () => {
    for (let n = 1; n <= 10; n++) {
      for (const d of DURATIONS) {
        const sel: front.ExtrasSelection = { urgente: n % 2 === 0, img500: n % 3 === 0 };
        expect(shared.totalPrice(n, d, sel, settings)).toBe(front.totalPrice(n, d, sel, settings));
      }
    }
  });
});
