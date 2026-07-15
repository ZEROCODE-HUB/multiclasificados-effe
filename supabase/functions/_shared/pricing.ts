// Núcleo de precios EFFE — copia PURA de src/lib/pricing.ts, sin dependencias
// del navegador (localStorage/window), para poder RECALCULAR el monto de la
// compra en el servidor (Edge Function create-payment) en lugar de confiar en
// el precio que envía el cliente.
//
// IMPORTANTE: estas funciones deben devolver EXACTAMENTE lo mismo que las de
// src/lib/pricing.ts. La paridad está anclada por src/test/pricingParity.test.ts.
// Si tocas la fórmula aquí, tócala allá (y viceversa).

export type DurationDays = 3 | 7 | 15 | 30 | 60 | 90;

export interface ExtraPrices {
  img100: number;
  img500: number;
  pdf100: number;
  pdf500: number;
  urgente: number;
  destacado: number;
  confidencial: number;
}

export interface PricingSettings {
  base: number;
  descPorAviso: number;
  descCantidad?: number[];
  saltos: { 15: number; 30: number; 60: number; 90: number };
  extras: ExtraPrices;
}

export interface ExtrasSelection {
  img100?: boolean | number;
  img500?: boolean | number;
  pdf100?: boolean | number;
  pdf500?: boolean | number;
  urgente?: boolean | number;
  destacado?: boolean | number;
  confidencial?: boolean | number;
}

const DEFAULT_DESC_CANTIDAD = [0, 0, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06];

export const DEFAULT_SETTINGS: PricingSettings = {
  base: 16.14,
  descPorAviso: 0.06,
  descCantidad: DEFAULT_DESC_CANTIDAD,
  saltos: { 15: 0.14, 30: 0.13, 60: 0.12, 90: 0.11 },
  extras: {
    img100: 0,
    img500: 5,
    pdf100: 0,
    pdf500: 5,
    urgente: 5,
    destacado: 5,
    confidencial: 0,
  },
};

// IGV de Perú (18%). Los precios ya vienen "con IGV"; esta constante separa
// subtotal/IGV para órdenes y comprobantes.
export const IGV_RATE = 0.18;

// 1 crédito = 1 sol.
export const CREDIT_MULTIPLIER = 1;

// Precio TOTAL del paquete de n avisos por `dias` (7/15/30/60/90).
export function priceFor(n: number, dias: 7 | 15 | 30 | 60 | 90, s: PricingSettings): number {
  let price = s.base * n;
  if (s.descCantidad && s.descCantidad.length) {
    let volFactor = 1;
    for (let k = 2; k <= n; k++) {
      volFactor *= 1 - (s.descCantidad[k] ?? s.descPorAviso);
    }
    price = price * volFactor;
  } else {
    price = price * Math.pow(1 - s.descPorAviso, Math.max(0, n - 1));
  }
  const steps: Array<{ to: 15 | 30 | 60 | 90; key: 15 | 30 | 60 | 90; mult: number }> = [
    { to: 15, key: 15, mult: 2 },
    { to: 30, key: 30, mult: 2 },
    { to: 60, key: 60, mult: 2 },
    { to: 90, key: 90, mult: 1.5 },
  ];
  for (const step of steps) {
    if (dias >= step.to) {
      price = price * step.mult * (1 - s.saltos[step.key]);
    }
  }
  return Math.round(price * 100) / 100;
}

// Precio para 3 días: proporcional 3/7 del precio de 7 días.
export function priceForDuration(n: number, dias: DurationDays, s: PricingSettings): number {
  if (dias === 3) {
    return Math.round((priceFor(n, 7, s) * 3) / 7 * 100) / 100;
  }
  return priceFor(n, dias, s);
}

export function extrasTotal(sel: ExtrasSelection, s: PricingSettings): number {
  let total = 0;
  (Object.keys(s.extras) as Array<keyof ExtraPrices>).forEach((k) => {
    total += s.extras[k] * (Number(sel[k]) || 0);
  });
  return Math.round(total * 100) / 100;
}

export function totalPrice(n: number, dias: DurationDays, sel: ExtrasSelection, s: PricingSettings): number {
  return Math.round((priceForDuration(n, dias, s) + extrasTotal(sel, s)) * 100) / 100;
}

// Separa un total (con IGV) en subtotal + IGV. Fuente única para comprobantes.
export function splitIgv(total: number): { subtotal: number; igv: number } {
  const subtotal = Math.round((total / (1 + IGV_RATE)) * 100) / 100;
  return { subtotal, igv: Math.round((total - subtotal) * 100) / 100 };
}

// Redondea al céntimo: el crédito ya es el sol.
export function solesToCredits(soles: number): number {
  return Math.round(soles * CREDIT_MULTIPLIER * 100) / 100;
}

// Convierte la fila de pricing_settings (BD) al shape PricingSettings. Espeja a
// src/lib/pricingRemote.ts para que servidor y cliente lean la tarifa igual.
export function settingsFromRow(row: Record<string, unknown> | null | undefined): PricingSettings {
  if (!row) return DEFAULT_SETTINGS;
  const descCantidad = Array.isArray(row.desc_cantidad) && row.desc_cantidad.length
    ? (row.desc_cantidad as number[])
    : undefined;
  return {
    base: Number(row.base),
    descPorAviso: Number(row.desc_por_aviso),
    descCantidad,
    saltos: { ...DEFAULT_SETTINGS.saltos, ...((row.saltos as object) ?? {}) },
    extras: { ...DEFAULT_SETTINGS.extras, ...((row.extras as object) ?? {}) },
  };
}
