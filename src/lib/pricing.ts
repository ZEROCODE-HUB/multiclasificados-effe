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
  descPorAviso: number; // descuento decimal por aviso adicional (fallback / retrocompat)
  // Descuento decimal por CANTIDAD, uno por nivel: índice n (0..10) = descuento
  // vs. el nivel anterior. n=0 y n=1 → 0. Reemplaza al promedio único.
  descCantidad?: number[];
  saltos: { 15: number; 30: number; 60: number; 90: number }; // descuento decimal por rango
  extras: ExtraPrices;
}

// Descuento por cantidad por defecto: 6% por cada aviso adicional (niveles 2..10).
const DEFAULT_DESC_CANTIDAD = [0, 0, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.06];

export const DEFAULT_SETTINGS: PricingSettings = {
  base: 16.14,
  descPorAviso: 0.06,
  descCantidad: DEFAULT_DESC_CANTIDAD,
  saltos: { 15: 0.14, 30: 0.13, 60: 0.12, 90: 0.11 },
  extras: {
    img100: 0,          // incluida en el precio base (Excel: "Si")
    img500: 5,          // segunda imagen >100 KB — S/ 5 extra
    pdf100: 0,          // PDF hasta 100 KB incluido (Excel: "Si")
    pdf500: 5,          // PDF hasta 500 KB — S/ 5 extra
    urgente: 5,
    destacado: 5,
    confidencial: 0,    // gratuita (Excel: "Si")
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
      descCantidad: Array.isArray(parsed?.descCantidad) && parsed.descCantidad.length
        ? parsed.descCantidad
        : DEFAULT_DESC_CANTIDAD,
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

// Precio TOTAL del paquete de n avisos por `dias`. dias debe ser 7/15/30/60/90.
// El total crece con la cantidad, pero el precio POR aviso baja por volumen:
//   total(n) = base · n · (1 - desc)^(n-1) · (factores de duración)
//   por aviso = base · (1 - desc)^(n-1) · (factores de duración)
export function priceFor(n: number, dias: 7 | 15 | 30 | 60 | 90, s: PricingSettings = loadSettings()): number {
  // base × cantidad de avisos
  let price = s.base * n;
  // Descuento por volumen: producto de (1 - descuento de cada nivel 2..n).
  // Si hay tabla por cantidad se usa nivel a nivel; si no, cae al % único.
  if (s.descCantidad && s.descCantidad.length) {
    let volFactor = 1;
    for (let k = 2; k <= n; k++) {
      volFactor *= 1 - (s.descCantidad[k] ?? s.descPorAviso);
    }
    price = price * volFactor;
  } else {
    price = price * Math.pow(1 - s.descPorAviso, Math.max(0, n - 1));
  }
  // Factor días: cada rango parte del anterior multiplicado por la relación de
  // días y aplicándole el descuento. Según la lista de precios oficial (Excel):
  // 7→15, 15→30, 30→60 duplican (×2); 60→90 es ×1.5 (90 = 1.5 × 60).
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
export function priceForDuration(n: number, dias: DurationDays, s: PricingSettings = loadSettings()): number {
  if (dias === 3) {
    return Math.round((priceFor(n, 7, s) * 3) / 7 * 100) / 100;
  }
  return priceFor(n, dias, s);
}

// Cada extra puede ser un flag (true/false) o una CANTIDAD (p. ej. "Imagen
// adicional" admite hasta 3). El costo se multiplica por la cantidad.
export interface ExtrasSelection {
  img100?: boolean | number;
  img500?: boolean | number;
  pdf100?: boolean | number;
  pdf500?: boolean | number;
  urgente?: boolean | number;
  destacado?: boolean | number;
  confidencial?: boolean | number;
}

export function extrasTotal(sel: ExtrasSelection, s: PricingSettings = loadSettings()): number {
  let total = 0;
  (Object.keys(s.extras) as Array<keyof ExtraPrices>).forEach((k) => {
    // Number(true) = 1, Number(3) = 3, Number(undefined) = NaN → 0.
    total += s.extras[k] * (Number(sel[k]) || 0);
  });
  return Math.round(total * 100) / 100;
}

export function totalPrice(n: number, dias: DurationDays, sel: ExtrasSelection, s: PricingSettings = loadSettings()): number {
  return Math.round((priceForDuration(n, dias, s) + extrasTotal(sel, s)) * 100) / 100;
}

// ─── Créditos (1 crédito = 1 sol) ──────────────────────────────────────────
// El crédito vale exactamente un sol, así que el saldo se muestra como "S/" y
// no como una moneda aparte. Se conservan los dos decimales del precio (base
// 16.14) para que el saldo cuadre al céntimo con la boleta; las columnas de la
// BD son numeric(12,2).
export const CREDIT_MULTIPLIER = 1;

// IGV de Perú (18%). En el Excel los precios ya vienen "con IGV"; esta constante
// centraliza la tasa para separar subtotal/IGV en boletas y órdenes.
export const IGV_RATE = 0.18;

// Separa un total (con IGV) en subtotal + IGV. Fuente única para comprobantes.
export function splitIgv(total: number): { subtotal: number; igv: number } {
  const subtotal = Math.round((total / (1 + IGV_RATE)) * 100) / 100;
  return { subtotal, igv: Math.round((total - subtotal) * 100) / 100 };
}

// Redondea al céntimo, no al entero: el crédito ya es el sol.
export function solesToCredits(soles: number): number {
  return Math.round(soles * CREDIT_MULTIPLIER * 100) / 100;
}

// Costo de un aviso EN CRÉDITOS según cantidad y duración.
export function creditsForDuration(n: number, dias: DurationDays, s: PricingSettings = loadSettings()): number {
  return solesToCredits(priceForDuration(n, dias, s));
}

// Costo de referencia de un aviso estándar (1 aviso, 7 días): en soles y en créditos.
export function standardAdCost(s: PricingSettings = loadSettings()): number {
  return priceForDuration(1, 7, s);
}
export function standardAdCredits(s: PricingSettings = loadSettings()): number {
  return solesToCredits(standardAdCost(s));
}

// Cuántos avisos estándar (7 días) alcanza un saldo de CRÉDITOS.
export function avisosForBalance(balanceCredits: number, s: PricingSettings = loadSettings()): number {
  const cost = standardAdCredits(s);
  if (cost <= 0) return 0;
  return Math.max(0, Math.floor(balanceCredits / cost));
}

// Desglose: cuántos avisos alcanza el saldo por cada duración. `cost` va EN CRÉDITOS.
export const DURATION_OPTIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];
export function avisosBreakdown(
  balanceCredits: number,
  s: PricingSettings = loadSettings(),
): Array<{ dias: DurationDays; cost: number; count: number }> {
  return DURATION_OPTIONS.map((dias) => {
    const cost = solesToCredits(priceForDuration(1, dias, s));
    return { dias, cost, count: cost > 0 ? Math.max(0, Math.floor(balanceCredits / cost)) : 0 };
  });
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

// 1 crédito = 1 sol: el saldo y el costo de un aviso se muestran como dinero,
// con la sigla "S/" ("S/ 16.14"). Los enteros no arrastran ".00": "S/ 8472".
export function formatCredits(v: number) {
  const n = Math.round(v * 100) / 100;
  const cifra = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `S/ ${cifra}`;
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
  docNumber?: string;   // DNI/RUC verificado del anunciante
}
export function loadInvoices(): Invoice[] {
  try {
    const all = JSON.parse(localStorage.getItem(INVOICES_KEY) || "[]");
    return Array.isArray(all) ? all : [];
  } catch { return []; }
}

// Contador persistente e independiente del nº de filas: así el número del
// comprobante nunca se repite ni se "reusa" aunque se borre alguna boleta.
const INVOICE_SEQ_KEY = "effe:invoice-seq";
function nextInvoiceSeq(fallback: number): number {
  const stored = Number(localStorage.getItem(INVOICE_SEQ_KEY));
  const base = Number.isFinite(stored) && stored > 0 ? stored : fallback;
  const seq = base + 1;
  localStorage.setItem(INVOICE_SEQ_KEY, String(seq));
  return seq;
}
function uniqueInvoiceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `INV-${crypto.randomUUID()}`;
  }
  return `INV-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// Guarda SIEMPRE un comprobante. Acepta un número de serie ya emitido (p. ej.
// el que devuelve la BD) para que coincida con lo que vio el usuario; si no,
// genera uno local correlativo. id único → nunca se pierde una fila por clave duplicada.
export function addInvoice(
  inv: Omit<Invoice, "id" | "number" | "date"> & { number?: string },
): Invoice {
  const all = loadInvoices();
  const seq = nextInvoiceSeq(all.length);
  const next: Invoice = {
    email: inv.email,
    advertiser: inv.advertiser,
    listingTitle: inv.listingTitle,
    amount: inv.amount,
    detail: inv.detail,
    docNumber: inv.docNumber,
    id: uniqueInvoiceId(),
    number: inv.number?.trim() || `B001-${String(seq).padStart(6, "0")}`,
    date: new Date().toISOString(),
  };
  all.unshift(next);
  localStorage.setItem(INVOICES_KEY, JSON.stringify(all));
  // Avisa a otras pestañas/paneles (AdvertiserInvoices/AdminCommercial) para refrescar.
  try { window.dispatchEvent(new Event("effe:invoices-updated")); } catch { /* noop */ }
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
