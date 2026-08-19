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
  docType?: "dni" | "ruc" | "ce" | "pasaporte";
  /** País del comprador (ISO alpha-2). Por defecto PE. */
  country?: string;
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
  /** "renew" suma días a un aviso vivo en vez de publicar uno en borrador. */
  purpose?: "publish" | "renew";
}

export interface CreatePaymentResult {
  orderId: string;
  formToken: string;
  publicKey: string | null;
  amount: number;            // lo que se cobra ahora, en soles
  listingCost: number | null; // costo del aviso (solo en pagar-y-publicar)
}

// Yape/Plin: no hay formToken ni pasarela. El servidor deja la orden esperando
// y devuelve a dónde transferir y a qué WhatsApp mandar el voucher.
export interface PagoManualCreado {
  manual: true;
  orderId: string;
  provider: "yape" | "plin";
  amount: number;
  listingCost: number | null;
  cuentas: { metodo: "yape" | "plin"; numero: string; banco: string; titular: string }[];
  whatsapp: string;
  mensaje: string;
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
async function invokeCreatePayment(body: unknown): Promise<CreatePaymentResult | PagoManualCreado> {
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
  if (data.manual === true) {
    return {
      manual: true,
      orderId: data.orderId as string,
      provider: data.provider as "yape" | "plin",
      amount: Number(data.amount ?? 0),
      listingCost: data.listingCost === null || data.listingCost === undefined
        ? null
        : Number(data.listingCost),
      cuentas: Array.isArray(data.cuentas) ? data.cuentas : [],
      whatsapp: String(data.whatsapp ?? ""),
      mensaje: String(data.mensaje ?? ""),
    };
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

/** Distingue en tiempo de ejecución cuál de las dos respuestas llegó. */
export function esPagoManual(r: CreatePaymentResult | PagoManualCreado): r is PagoManualCreado {
  return (r as PagoManualCreado).manual === true;
}

// `provider` elige el medio: sin él, tarjeta por la pasarela; con "yape" o
// "plin", la orden queda esperando la aprobación de una persona.
export function createPayment(
  config: PurchaseConfig & { provider?: "yape" | "plin" },
): Promise<CreatePaymentResult | PagoManualCreado> {
  return invokeCreatePayment(config);
}

export function createPublishPayment(
  config: PublishPaymentConfig & { provider?: "yape" | "plin" },
): Promise<CreatePaymentResult | PagoManualCreado> {
  return invokeCreatePayment(config);
}

/** Pagar el faltante para RENOVAR un aviso: el servidor lo renueva al cobrar. */
export function createRenewPayment(
  config: Omit<PublishPaymentConfig, "purpose"> & { provider?: "yape" | "plin" },
): Promise<CreatePaymentResult | PagoManualCreado> {
  return invokeCreatePayment({ ...config, purpose: "renew" });
}

export type OrderOutcome = "paid" | "failed" | "timeout";

interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: { aborted: boolean };
}

/**
 * Espera entre consulta y consulta.
 *
 * El aviso de pago (IPN) de Izipay llega entre 1 y 10 segundos después de que la
 * tarjeta se aprueba. Preguntando cada 1,5 s fijos se perdía hasta un ciclo
 * entero esperando de más justo al principio, que es cuando el usuario mira la
 * pantalla. Empezamos rápido y vamos aflojando: la mayoría de los pagos se
 * confirman en las primeras consultas y las demás casi no cuestan.
 */
export function esperaDelSondeo(intento: number, maximo = 1500): number {
  const escala = [300, 600, 1000];
  return Math.min(escala[intento] ?? maximo, maximo);
}

// Sondea el estado de la orden hasta que el webhook la marque 'paid' (o 'failed'),
// o hasta agotar el tiempo. La RLS orders_select_own permite al dueño leerla.
export async function pollOrderStatus(orderId: string, opts: PollOptions = {}): Promise<OrderOutcome> {
  const maximo = opts.intervalMs ?? 1500;
  const timeout = opts.timeoutMs ?? 45000;
  const start = Date.now();

  let intento = 0;
  while (Date.now() - start < timeout) {
    if (opts.signal?.aborted) return "timeout";
    const { data } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
    const status = data?.status as string | undefined;
    if (status === "paid") return "paid";
    if (status === "failed") return "failed";
    await new Promise((r) => setTimeout(r, esperaDelSondeo(intento++, maximo)));
  }

  // Se acabó el tiempo sin que el aviso de pago llegara. Antes de dar el caso
  // por perdido, se le pregunta directamente a la pasarela: es exactamente el
  // caso "se cortó el internet justo al terminar de pagar".
  const rescate = await verificarOrden(orderId).catch(() => null);
  if (rescate?.status === "paid") return "paid";
  if (rescate?.status === "failed") return "failed";
  return "timeout";
}

export interface VerificacionDeOrden {
  status: "paid" | "failed" | "pending";
  /** true si esta llamada fue la que acreditó (no si ya estaba acreditada). */
  settled: boolean;
}

/**
 * Le pregunta a Izipay cómo quedó una orden y, si está pagada, la liquida.
 *
 * Es la red de seguridad del cobro: sin esto, un aviso de pago que no llega deja
 * la orden pendiente para siempre y el usuario paga sin recibir nada. No
 * acredita por su cuenta: la Edge Function llama a `settle_paid_order`, que es
 * la misma que usa el webhook y es idempotente.
 */
export async function verificarOrden(orderId: string): Promise<VerificacionDeOrden> {
  const { data, error } = await supabase.functions.invoke("verify-payment", { body: { orderId } });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  const status = r.status === "paid" || r.status === "failed" ? r.status : "pending";
  return { status, settled: r.settled === true };
}

/** Órdenes propias sin confirmar de las últimas 24 h. La RLS ya limita al dueño. */
export async function ordenesPendientesRecientes(): Promise<string[]> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("status", "pending")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return [];
  return (data ?? []).map((o) => String((o as Record<string, unknown>).id));
}

/**
 * Repasa los pagos propios que quedaron sin confirmar y los resuelve.
 *
 * Se llama al abrir la app y al volver a ella: si el usuario pagó y se le cortó
 * la conexión, su saldo aparece solo en cuanto vuelve, sin que tenga que
 * escribir a soporte. Devuelve cuántas órdenes se acreditaron en esta pasada.
 */
export async function reconciliarOrdenesPendientes(): Promise<number> {
  const pendientes = await ordenesPendientesRecientes();
  let acreditadas = 0;
  // De una en una: son pocas y no hay ninguna prisa; en paralelo solo
  // conseguiríamos varias consultas simultáneas a la pasarela.
  for (const id of pendientes) {
    const r = await verificarOrden(id).catch(() => null);
    if (r?.status === "paid") acreditadas++;
  }
  return acreditadas;
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
