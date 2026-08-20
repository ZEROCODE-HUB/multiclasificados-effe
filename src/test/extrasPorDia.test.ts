// El adicional se cobra POR CADA DÍA PUBLICADO (decisión del 2026-08-12).
//
// Antes era un pago único: marcar "Destacado" costaba lo mismo en un aviso de 3
// días que en uno de 90, aunque en el de 90 ocupa el sitio privilegiado treinta
// veces más tiempo. La tarifa que hay en el panel de administración pasó a ser
// diaria; las cifras no cambiaron, cambió por cuánto se multiplican.
import { describe, it, expect } from "vitest";
import {
  extrasTotal,
  totalPrice,
  priceForDuration,
  DURATION_OPTIONS,
  type PricingSettings,
  type DurationDays,
} from "@/lib/pricing";

// Tarifa de laboratorio: números redondos para que la cuenta se lea a simple
// vista y no dependa de la tarifa real, que el administrador puede cambiar.
const TARIFA: PricingSettings = {
  base: 100,
  descPorAviso: 0,
  descCantidad: [],
  saltos: { 15: 0, 30: 0, 60: 0, 90: 0 },
  extras: { img100: 0, img500: 2, pdf100: 0, pdf500: 3, urgente: 4, destacado: 5, confidencial: 0, video20: 6 },
};

describe("el adicional se multiplica por los días", () => {
  it("el caso pedido: una imagen de S/ 2 en un aviso de 3 días cuesta S/ 6", () => {
    expect(extrasTotal({ img500: 1 }, 3, TARIFA)).toBe(6);
  });

  it("un solo día cobra la tarifa tal cual", () => {
    expect(extrasTotal({ img500: 1 }, 1 as DurationDays, TARIFA)).toBe(2);
  });

  it.each(DURATION_OPTIONS)("a %i días, el Destacado de S/ 5 cuesta 5 × esos días", (dias) => {
    expect(extrasTotal({ destacado: 1 }, dias, TARIFA)).toBe(5 * dias);
  });

  it("la cantidad y los días se multiplican los dos: 3 imágenes × S/ 2 × 30 días", () => {
    expect(extrasTotal({ img500: 3 }, 30, TARIFA)).toBe(180);
  });

  it("varios adicionales a la vez suman, cada uno por sus días", () => {
    // (2 + 3 + 4 + 5) × 15 = 210
    expect(extrasTotal({ img500: 1, pdf500: 1, urgente: 1, destacado: 1 }, 15, TARIFA)).toBe(210);
  });

  it("un adicional gratis sigue costando 0 por muchos días que dure", () => {
    expect(extrasTotal({ confidencial: 1 }, 90, TARIFA)).toBe(0);
  });

  it("sin adicionales no se cobra nada, sea cual sea la duración", () => {
    for (const d of DURATION_OPTIONS) expect(extrasTotal({}, d, TARIFA)).toBe(0);
  });

  it("`true` cuenta como uno, igual que antes", () => {
    expect(extrasTotal({ destacado: true }, 7, TARIFA)).toBe(35);
  });

  it("los 3 días cobran 3 días de adicional, no los 7 del precio base prorrateado", () => {
    // El AVISO de 3 días se cobra como 3/7 del de 7 días (prorrateo). El
    // ADICIONAL no: son 3 días de adicional y punto. Confundir las dos reglas
    // es el error fácil aquí.
    expect(priceForDuration(1, 3, TARIFA)).toBeCloseTo((100 * 3) / 7, 2);
    expect(extrasTotal({ destacado: 1 }, 3, TARIFA)).toBe(15);
  });
});

describe("el total = aviso + adicionales por día", () => {
  it("suma las dos partes con la misma duración", () => {
    // El precio del AVISO no es lineal (cada rango duplica al anterior), así
    // que se toma de la propia función en vez de escribir un número a mano.
    const aviso = priceForDuration(1, 30, TARIFA);
    expect(totalPrice(1, 30, { destacado: 1 }, TARIFA)).toBe(aviso + 5 * 30);
  });

  it("alargar el aviso encarece también sus adicionales", () => {
    const corto = totalPrice(1, 7, { destacado: 1 }, TARIFA);
    const largo = totalPrice(1, 30, { destacado: 1 }, TARIFA);
    // La diferencia tiene dos partes: la del aviso (que ya existía) y la del
    // adicional (que es lo nuevo): 5 × (30 − 7) = 115.
    const difDelAviso = priceForDuration(1, 30, TARIFA) - priceForDuration(1, 7, TARIFA);
    expect(largo - corto).toBe(difDelAviso + 115);
  });

  it("con la tarifa real, el adicional deja de costar lo mismo en 3 días que en 90", () => {
    const tresDias = extrasTotal({ destacado: 1 }, 3);
    const noventaDias = extrasTotal({ destacado: 1 }, 90);
    expect(noventaDias).toBe(tresDias * 30);
  });
});
