// Sistema de créditos pre-pagados.
// 1 crédito = 1 sol (CREDIT_MULTIPLIER = 1); el saldo se muestra como "S/".
// El saldo se descuenta al publicar un aviso.
//
// La COMPRA de saldo ya no vive aquí: el cobro real con Izipay lo maneja
// src/lib/payments.ts (create-payment) y la acreditación la hace el webhook
// (settle_paid_order). Este módulo solo LEE saldos/movimientos y GASTA créditos.
import { supabase } from "@/lib/supabase";

export interface CreditTransaction {
  id: string;
  type: "purchase" | "spend";
  credits: number;
  description: string | null;
  created_at: string;
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

