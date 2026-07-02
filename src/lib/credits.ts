// Sistema de créditos pre-pagados.
// 1 crédito = 1 sol (S/). El saldo se descuenta al publicar un aviso.
import { supabase } from "@/lib/supabase";

export interface CreditPackage {
  id: string;
  name: string;
  credits_amount: number;
  price_soles: number;
  sort_order: number;
  is_active: boolean;
}

export interface CreditTransaction {
  id: string;
  type: "purchase" | "spend";
  credits: number;
  description: string | null;
  created_at: string;
}

export interface PurchaseInvoiceData {
  receiptType: "boleta" | "factura";
  email: string;
  advertiserName: string;
  docType?: "dni" | "ruc";
  docNumber?: string;
}

// ─── Lectura de saldo ──────────────────────────────────────────────────────

export async function getCreditBalance(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data, error } = await supabase.rpc("get_credit_balance", { p_user_id: user.id });
  if (error) {
    // Fallback: leer directo de la tabla
    const { data: row } = await supabase
      .from("user_credits")
      .select("balance")
      .eq("user_id", user.id)
      .single();
    return Number(row?.balance ?? 0);
  }
  return Number(data ?? 0);
}

export async function getCreditsSpent(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { data } = await supabase.rpc("get_credits_spent", { p_user_id: user.id });
  return Number(data ?? 0);
}

export async function getCreditTransactions(): Promise<CreditTransaction[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("credit_transactions")
    .select("id, type, credits, description, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as CreditTransaction[];
}

// ─── Paquetes disponibles ──────────────────────────────────────────────────

export async function getCreditPackages(): Promise<CreditPackage[]> {
  const { data } = await supabase
    .from("credit_packages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as CreditPackage[];
}

// ─── Compra de créditos (simula pago; sin gateway real aún) ───────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function purchaseCredits(
  pkg: CreditPackage,
  invoiceData: PurchaseInvoiceData,
): Promise<{ newBalance: number; orderId: string; invoiceNumber: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para comprar créditos.");

  const total = pkg.price_soles;
  const subtotal = round2(total / 1.18);
  const igv = round2(total - subtotal);

  // 1) Crear orden
  const { data: order, error: oErr } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      listing_qty: 0,
      duration_days: 0,
      extras: { credit_package_id: pkg.id, credits: pkg.credits_amount },
      subtotal,
      igv,
      total,
      status: "paid",
      payment_provider: "creditos",
      payment_ref: `PKG-${pkg.id}`,
    })
    .select("id")
    .single();
  if (oErr || !order) throw new Error(oErr?.message ?? "No se pudo registrar la compra.");

  // 2) Guardar documento en el perfil si se provee
  if (invoiceData.docType && invoiceData.docNumber) {
    await supabase
      .from("profiles")
      .update({
        doc_type: invoiceData.docType,
        doc_number: invoiceData.docNumber,
        verified: true,
      })
      .eq("id", user.id);
  }

  // 3) Generar comprobante
  let invoiceNumber = "";
  const { data: inv } = await supabase
    .from("invoices")
    .insert({
      order_id: order.id,
      type: invoiceData.receiptType,
      email: invoiceData.email,
      advertiser_name: invoiceData.advertiserName,
      doc_number: invoiceData.docNumber ?? null,
      amount: total,
      detail: `Compra de créditos: ${pkg.name} (${pkg.credits_amount} créditos)`,
    })
    .select("number")
    .single();
  invoiceNumber = inv?.number ?? "";

  // 4) Acreditar créditos al usuario
  const { error: addErr } = await supabase.rpc("add_credits", {
    p_user_id: user.id,
    p_credits: pkg.credits_amount,
    p_description: `Compra ${pkg.name} — ${pkg.credits_amount} créditos`,
    p_order_id: order.id,
  });
  if (addErr) throw new Error("Créditos no acreditados: " + addErr.message);

  // 5) Devolver saldo actualizado
  const newBalance = await getCreditBalance();
  return { newBalance, orderId: order.id, invoiceNumber };
}

// ─── Gasto de créditos al publicar ────────────────────────────────────────

export async function spendCredits(
  credits: number,
  listingId: string,
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc("spend_credits", {
    p_user_id: user.id,
    p_credits: credits,
    p_listing_id: listingId,
  });
  if (error) {
    console.error("[credits] spend_credits error:", error.message);
    return false;
  }
  return Boolean(data);
}

// ─── CRUD de paquetes (admin) ──────────────────────────────────────────────

export async function upsertCreditPackage(
  pkg: Partial<CreditPackage> & Pick<CreditPackage, "name" | "credits_amount" | "price_soles">,
): Promise<CreditPackage> {
  const { data, error } = await supabase
    .from("credit_packages")
    .upsert(pkg)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as CreditPackage;
}

export async function deleteCreditPackage(id: string): Promise<void> {
  const { error } = await supabase.from("credit_packages").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getAllCreditPackages(): Promise<CreditPackage[]> {
  const { data } = await supabase
    .from("credit_packages")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data ?? []) as CreditPackage[];
}
