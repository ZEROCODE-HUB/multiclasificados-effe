// Sistema de promociones: un % de descuento aplicable a ciertas categorías
// dentro de un período. El descuento se aplica al costo en créditos al publicar.
import { supabase } from "@/lib/supabase";

export interface Promotion {
  id: string;
  name: string;
  discount_pct: number;      // 0–100
  starts_at: string;         // ISO
  ends_at: string;           // ISO
  category_ids: string[];    // [] = todas las categorías
  is_active: boolean;
}

// Todas las promociones (para el panel de admin).
export async function fetchPromotions(): Promise<Promotion[]> {
  try {
    const { data, error } = await supabase
      .from("promotions")
      .select("id, name, discount_pct, starts_at, ends_at, category_ids, is_active")
      .order("starts_at", { ascending: false });
    if (error) return [];
    return (data ?? []) as Promotion[];
  } catch {
    return [];
  }
}

// Promociones vigentes AHORA (activas y dentro del período). Para el flujo de publicar.
export async function fetchActivePromotions(): Promise<Promotion[]> {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("promotions")
      .select("id, name, discount_pct, starts_at, ends_at, category_ids, is_active")
      .eq("is_active", true)
      .lte("starts_at", now)
      .gte("ends_at", now);
    if (error) return [];
    return (data ?? []) as Promotion[];
  } catch {
    return [];
  }
}

export async function upsertPromotion(
  p: Omit<Promotion, "id"> & { id?: string },
): Promise<Promotion> {
  const { data: { user } } = await supabase.auth.getUser();
  const row: Record<string, unknown> = {
    name: p.name,
    discount_pct: p.discount_pct,
    starts_at: p.starts_at,
    ends_at: p.ends_at,
    category_ids: p.category_ids,
    is_active: p.is_active,
  };
  if (p.id) row.id = p.id;
  else row.created_by = user?.id ?? null;

  const { data, error } = await supabase
    .from("promotions")
    .upsert(row)
    .select("id, name, discount_pct, starts_at, ends_at, category_ids, is_active")
    .single();
  if (error) throw new Error(error.message);
  return data as Promotion;
}

export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// De una lista de promos vigentes, la de mayor descuento que aplique a la
// categoría dada (una promo sin categorías aplica a todas). null si ninguna.
export function bestPromoForCategory(
  promos: Promotion[],
  categoryId: string,
): Promotion | null {
  const applicable = promos.filter(
    (p) => p.category_ids.length === 0 || p.category_ids.includes(categoryId),
  );
  if (applicable.length === 0) return null;
  return applicable.reduce((best, p) => (p.discount_pct > best.discount_pct ? p : best));
}

// Aplica un % de descuento a un costo (redondeado a 2 decimales).
export function applyDiscount(cost: number, pct: number): number {
  const d = Math.max(0, Math.min(100, pct));
  return Math.round(cost * (1 - d / 100) * 100) / 100;
}
