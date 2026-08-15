// Cobro real con Izipay/Lyra: para COMPRAR SALDO o para PAGAR Y PUBLICAR un
// aviso concreto.
//
// El flujo tiene dos mitades: aquí (cliente) solo se PIDE el formToken y se
// espera la confirmación; la acreditación de créditos, la boleta y —en el modo
// pagar-y-publicar— la publicación del aviso las hace el webhook
// (server-to-server) cuando Izipay confirma el pago. Por eso el cliente NUNCA
// acredita ni publica: solo hace polling del estado de su propia orden.
import { supabase } from "@/lib/supabase";
import { getCreditBalance } from "@/lib/credits";

export interface PurchaseReceipt {
  receiptType: "boleta" | "factura";
  email: string;
  advertiserName: string;
  docType?: "dni" | "ruc" | "ce";
  docNumber?: string;
  factilizaData?: Record<string, unknown> | null;
}

export interface PurchaseConfig {
  quantity: number;
  duration: number;
  extras: Record<string, boolean | number>;
  receipt: PurchaseReceipt;
}

// Pagar y publicar: el cobro va atado a un aviso propio en borrador. El
// servidor calcula cuánto FALTA (costo del aviso − saldo) y publica el aviso al
// confirmarse el pago.
export interface PublishPaymentConfig {
  listingId: string;
  duration?: number; // opcional: si se cambió en el diálogo de borradores
  receipt: PurchaseReceipt;
}

export interface CreatePaymentResult {
  orderId: string;
  formToken: string;
  publicKey: string | null;
  amount: number;            // lo que se cobra ahora, en soles
  listingCost: number | null; // costo del aviso (solo en pagar-y-publicar)
}

// El usuario ya tiene saldo de sobra: no hay nada que cobrar y hay que publicar
// directo en vez de abrir la pasarela.
export class SaldoYaSuficiente extends Error {
  constructor() {
    super("Ya tienes saldo suficiente para publicar.");
    this.name = "SaldoYaSuficiente";
  }
}

// Llama a la Edge Function create-payment: crea la orden 'pending' y devuelve el
// formToken de Izipay. El monto lo recalcula el servidor (no se envía el precio).
async function invokeCreatePayment(body: unknown): Promise<CreatePaymentResult> {
  const { data, error } = await supabase.functions.invoke("create-payment", { body });

  if (error) {
    // El cuerpo de error de una Edge Function viene en error.context (Response).
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const b = await ctx.json();
        if (b?.error) message = b.error;
      }
    } catch {
      /* se mantiene el mensaje original */
    }
    throw new Error(message);
  }

  if (!data?.success) {
    if (data?.code === "SALDO_SUFICIENTE") throw new SaldoYaSuficiente();
    throw new Error(data?.error ?? "No se pudo iniciar el pago.");
  }
  return {
    orderId: data.orderId as string,
    formToken: data.formToken as string,
    publicKey: (data.publicKey as string | null) ?? null,
    amount: Number(data.amount ?? 0),
    listingCost: data.listingCost === null || data.listingCost === undefined
      ? null
      : Number(data.listingCost),
  };
}

export function createPayment(config: PurchaseConfig): Promise<CreatePaymentResult> {
  return invokeCreatePayment(config);
}

export function createPublishPayment(config: PublishPaymentConfig): Promise<CreatePaymentResult> {
  return invokeCreatePayment(config);
}

// ── Simulación de pago (SOLO PRUEBAS) ────────────────────────────────────────
// Salta Izipay: la Edge Function crea la orden y la liquida en el acto, igual
// que haría el webhook. Sirve para probar de punta a punta el comprobante, su
// envío a SUNAT y el correo sin necesitar una tarjeta.
//
// El servidor manda: si ALLOW_FAKE_PAYMENT no está en "true", devuelve 403 y
// desde aquí no hay forma de forzarlo. Quién ve el botón lo decide el propio
// modal (`SIMULACION_VISIBLE` en BuyCreditsModal.tsx).
export interface SimulatedPaymentResult {
  orderId: string;
  invoiceNumber: string;
  credits: number;
  amount: number;
  balance: number;
  /** null cuando era una compra de saldo; true/false al pagar y publicar. */
  published: boolean | null;
}

async function invokeSimulatePayment(body: unknown): Promise<SimulatedPaymentResult> {
  const { data, error } = await supabase.functions.invoke("simulate-payment", { body });

  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const b = await ctx.json();
        if (b?.error) message = b.error;
      }
    } catch {
      /* se mantiene el mensaje original */
    }
    throw new Error(message);
  }

  if (!data?.success) {
    if (data?.code === "SALDO_SUFICIENTE") throw new SaldoYaSuficiente();
    throw new Error(data?.error ?? "No se pudo simular el pago.");
  }
  return {
    orderId: data.orderId as string,
    invoiceNumber: (data.invoiceNumber as string) ?? "",
    credits: Number(data.credits ?? 0),
    amount: Number(data.amount ?? 0),
    balance: Number(data.balance ?? 0),
    published: typeof data.published === "boolean" ? data.published : null,
  };
}

export function simulatePayment(config: PurchaseConfig): Promise<SimulatedPaymentResult> {
  return invokeSimulatePayment(config);
}

export function simulatePublishPayment(config: PublishPaymentConfig): Promise<SimulatedPaymentResult> {
  return invokeSimulatePayment(config);
}

export type OrderOutcome = "paid" | "failed" | "timeout";

interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: { aborted: boolean };
}

// Sondea el estado de la orden hasta que el webhook la marque 'paid' (o 'failed'),
// o hasta agotar el tiempo. La RLS orders_select_own permite al dueño leerla.
export async function pollOrderStatus(orderId: string, opts: PollOptions = {}): Promise<OrderOutcome> {
  const interval = opts.intervalMs ?? 1500;
  const timeout = opts.timeoutMs ?? 45000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (opts.signal?.aborted) return "timeout";
    const { data } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
    const status = data?.status as string | undefined;
    if (status === "paid") return "paid";
    if (status === "failed") return "failed";
    await new Promise((r) => setTimeout(r, interval));
  }
  return "timeout";
}

// Tras confirmarse el pago: saldo actualizado, número de la boleta emitida y,
// si la orden venía atada a un aviso, si el servidor llegó a publicarlo.
// `published` es null cuando la orden era una compra de saldo normal.
export async function getPurchaseResult(
  orderId: string,
): Promise<{ balance: number; invoiceNumber: string; published: boolean | null }> {
  const balance = await getCreditBalance();
  const [invoice, order] = await Promise.all([
    supabase.from("invoices").select("number").eq("order_id", orderId).maybeSingle(),
    supabase.from("orders").select("extras").eq("id", orderId).maybeSingle(),
  ]);
  const extras = (order.data?.extras ?? {}) as Record<string, unknown>;
  return {
    balance,
    invoiceNumber: (invoice.data?.number as string) ?? "",
    published: typeof extras.published === "boolean" ? extras.published : null,
  };
}

// URL de la página de pago propia (ruta /pay) que se abre en el navegador del
// sistema desde el APK. Lleva el formToken y la clave pública por query.
export function hostedPaymentUrl(r: CreatePaymentResult, publicKeyFallback: string): string {
  const base = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const pk = r.publicKey || publicKeyFallback;
  const q = new URLSearchParams({ orderId: r.orderId, token: r.formToken, pk });
  return `${base}/pay?${q.toString()}`;
}
