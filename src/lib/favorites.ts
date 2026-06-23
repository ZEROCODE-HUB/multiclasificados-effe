// REQ-03: favoritos (like/unlike rápido) sobre Supabase.
import { supabase } from "@/lib/supabase";

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Alterna favorito. Devuelve true si quedó guardado, false si se quitó,
// o null si no aplica (id no real / sin sesión).
export async function toggleFavorite(listingId: string): Promise<boolean | null> {
  if (!isUuid(listingId)) return null;
  const { data, error } = await supabase.rpc("toggle_favorite", { p_listing: listingId });
  if (error) throw error;
  return data as boolean;
}

// Ids de avisos en favoritos del usuario actual.
export async function fetchFavoriteIds(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from("favorites").select("listing_id");
    if (error) throw error;
    return new Set((data ?? []).map((r: { listing_id: string }) => r.listing_id));
  } catch {
    return new Set();
  }
}
