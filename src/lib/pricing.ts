// Motor de precios EFFE — calcula la matriz a partir de parámetros editables.
// Persistido en localStorage para que el módulo de Tarifas (Admin/Superadmin)
// pueda modificarlo y los cambios se reflejen en el flujo de publicación.

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
  base: number; // precio base 1 aviso × 7 días (incluye IGV)
  descPorAviso: number; // descuento decimal por cada aviso adicional (acumulativo)
  saltos: { 15: number; 30: number; 60: number; 90: number }; // descuento decimal por rango
  extras: ExtraPrices;
}

export const DEFAULT_SETTINGS: PricingSettings = {
  base: 16.14,
  descPorAviso: 0.06,
  saltos: { 15: 0.14, 30: 0.13, 60: 0.12, 90: 0.11 },
  extras: {
    img100: 5,
    img500: 5,
    pdf100: 5,
    pdf500: 5,
    urgente: 10,
    destacado: 15,
    confidencial: 8,
  },
};

const STORAGE_KEY = "effe:pricing-settings";

export function loadSettings(): PricingSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      saltos: { ...DEFAULT_SETTINGS.saltos, ...(parsed?.saltos ?? {}) },
      extras: { ...DEFAULT_SETTINGS.extras, ...(parsed?.extras ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: PricingSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("effe:pricing-updated"));
}

// Precio base por (cantidadAvisos, dias). dias debe ser 7/15/30/60/90.
export function priceFor(n: number, dias: 7 | 15 | 30 | 60 | 90, s: PricingSettings = loadSettings()): number {
  let price = s.base;
  // factor cantidad: (1 - desc)^(n-1)
  price = price * Math.pow(1 - s.descPorAviso, Math.max(0, n - 1));
  // factor días: por cada salto duplicar y aplicar descuento
  const steps: Array<{ to: 15 | 30 | 60 | 90; key: 15 | 30 | 60 | 90 }> = [
    { to: 15, key: 15 },
    { to: 30, key: 30 },
    { to: 60, key: 60 },
    { to: 90, key: 90 },
  ];
  for (const step of steps) {
    if (dias >= step.to) {
      price = price * 2 * (1 - s.saltos[step.key]);
    }
  }
  return Math.round(price * 100) / 100;
}

// Precio para 3 días: proporcional 3/7 del precio de 7 días.
export function priceForDuration(n: number, dias: DurationDays, s: PricingSettings = loadSettings()): number {
  if (dias === 3) {
    return Math.round((priceFor(n, 7, s) * 3) / 7 * 100) / 100;
  }
  return priceFor(n, dias, s);
}

export interface ExtrasSelection {
  img100?: boolean;
  img500?: boolean;
  pdf100?: boolean;
  pdf500?: boolean;
  urgente?: boolean;
  destacado?: boolean;
  confidencial?: boolean;
}

export function extrasTotal(sel: ExtrasSelection, s: PricingSettings = loadSettings()): number {
  let total = 0;
  (Object.keys(s.extras) as Array<keyof ExtraPrices>).forEach((k) => {
    if (sel[k]) total += s.extras[k];
  });
  return Math.round(total * 100) / 100;
}

export function totalPrice(n: number, dias: DurationDays, sel: ExtrasSelection, s: PricingSettings = loadSettings()): number {
  return Math.round((priceForDuration(n, dias, s) + extrasTotal(sel, s)) * 100) / 100;
}

export function buildMatrix(s: PricingSettings = loadSettings()) {
  const rows: Array<{ n: number; values: Record<7 | 15 | 30 | 60 | 90, number> }> = [];
  for (let n = 1; n <= 10; n++) {
    rows.push({
      n,
      values: {
        7: priceFor(n, 7, s),
        15: priceFor(n, 15, s),
        30: priceFor(n, 30, s),
        60: priceFor(n, 60, s),
        90: priceFor(n, 90, s),
      },
    });
  }
  return rows;
}

export function formatSoles(v: number) {
  return `S/ ${v.toFixed(2)}`;
}

// === Helpers para reportes/cierre de venta/boletas (persistidos en localStorage) ===
const REPORTS_KEY = "effe:reports";
const SOLD_KEY = "effe:sold";
const INVOICES_KEY = "effe:invoices";
const DISABLED_KEY = "effe:disabled-listings";

export interface ReportEntry {
  id: string;
  listingId: string;
  listingTitle: string;
  reason: string;
  reportedBy: string;
  date: string;
  category?: string;
}

export function loadReports(): ReportEntry[] {
  try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]"); } catch { return []; }
}
export function addReport(r: Omit<ReportEntry, "id" | "date">) {
  const all = loadReports();
  all.unshift({ ...r, id: `R-${Date.now()}`, date: new Date().toISOString() });
  localStorage.setItem(REPORTS_KEY, JSON.stringify(all));
}

export interface SoldEntry {
  listingId: string;
  buyer?: string;
  seller?: string;
  date: string;
}
export function loadSold(): Record<string, SoldEntry> {
  try { return JSON.parse(localStorage.getItem(SOLD_KEY) || "{}"); } catch { return {}; }
}
export function markSold(listingId: string, who: "buyer" | "seller", name: string) {
  const all = loadSold();
  const prev = all[listingId] ?? { listingId, date: new Date().toISOString() };
  all[listingId] = { ...prev, [who]: name, date: new Date().toISOString() };
  localStorage.setItem(SOLD_KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("effe:sold-updated"));
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  email: string;
  advertiser: string;
  listingTitle: string;
  amount: number;
  detail: string;
}
export function loadInvoices(): Invoice[] {
  try { return JSON.parse(localStorage.getItem(INVOICES_KEY) || "[]"); } catch { return []; }
}
export function addInvoice(inv: Omit<Invoice, "id" | "number" | "date">): Invoice {
  const all = loadInvoices();
  const next: Invoice = {
    ...inv,
    id: `INV-${Date.now()}`,
    number: `B001-${String(all.length + 1).padStart(6, "0")}`,
    date: new Date().toISOString(),
  };
  all.unshift(next);
  localStorage.setItem(INVOICES_KEY, JSON.stringify(all));
  return next;
}

export function loadDisabled(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(DISABLED_KEY) || "{}"); } catch { return {}; }
}
export function disableListing(listingId: string, reason: string) {
  const all = loadDisabled();
  all[listingId] = reason;
  localStorage.setItem(DISABLED_KEY, JSON.stringify(all));
}
