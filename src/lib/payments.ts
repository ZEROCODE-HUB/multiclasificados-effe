// Cobro real con Izipay/Lyra para COMPRAR SALDO.
//
// El flujo tiene dos mitades: aquí (cliente) solo se PIDE el formToken y se
// espera la confirmación; la acreditación de créditos y la boleta las hace el
// webhook (server-to-server) cuando Izipay confirma el pago. Por eso el cliente
// NUNCA acredita: solo hace polling del estado de su propia orden.
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

export interface CreatePaymentResult {
  orderId: string;
  formToken: string;
  publicKey: string | null;
}

// Llama a la Edge Function create-payment: crea la orden 'pending' y devuelve el
// formToken de Izipay. El monto lo recalcula el servidor (no se envía el precio).
export async function createPayment(config: PurchaseConfig): Promise<CreatePaymentResult> {
  const { data, error } = await supabase.functions.invoke("create-payment", { body: config });

  if (error) {
    // El cuerpo de error de una Edge Function viene en error.context (Response).
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch {
      /* se mantiene el mensaje original */
    }
    throw new Error(message);
  }

  if (!data?.success) throw new Error(data?.error ?? "No se pudo iniciar el pago.");
  return {
    orderId: data.orderId as string,
    formToken: data.formToken as string,
    publicKey: (data.publicKey as string | null) ?? null,
  };
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

// Tras confirmarse el pago: saldo actualizado + número de la boleta emitida.
export async function getPurchaseResult(orderId: string): Promise<{ balance: number; invoiceNumber: string }> {
  const balance = await getCreditBalance();
  const { data } = await supabase
    .from("invoices")
    .select("number")
    .eq("order_id", orderId)
    .maybeSingle();
  return { balance, invoiceNumber: (data?.number as string) ?? "" };
}

// URL de la página de pago propia (ruta /pay) que se abre en el navegador del
// sistema desde el APK. Lleva el formToken y la clave pública por query.
export function hostedPaymentUrl(r: CreatePaymentResult, publicKeyFallback: string): string {
  const base = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const pk = r.publicKey || publicKeyFallback;
  const q = new URLSearchParams({ orderId: r.orderId, token: r.formToken, pk });
  return `${base}/pay?${q.toString()}`;
}
