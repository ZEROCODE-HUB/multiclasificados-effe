// REQ-04: búsquedas guardadas + alertas.
// La tabla `saved_searches` guarda el criterio en `criteria` (jsonb) y la
// función SQL `run_saved_search_alerts` (vía pg_cron) cuenta avisos nuevos y
// crea notificaciones cuando `alert_enabled` está activo.
import { supabase } from "@/lib/supabase";
import { searchListings } from "@/lib/listings";

export interface SavedSearchCriteria {
  q?: string;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: string;
}

export interface SavedSearch {
  id: string;
  name: string | null;
  criteria: SavedSearchCriteria;
  alert_enabled: boolean;
  created_at: string;
  last_run_at: string | null;
  last_notified_at: string | null;
}

export async function fetchSavedSearches(): Promise<SavedSearch[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  try {
    const { data, error } = await supabase
      .from("saved_searches")
      .select("id, name, criteria, alert_enabled, created_at, last_run_at, last_notified_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedSearch[];
  } catch {
    return [];
  }
}

// Crea una búsqueda guardada con el criterio actual del buscador.
export async function createSavedSearch(
  criteria: SavedSearchCriteria,
  name: string
): Promise<SavedSearch | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para guardar búsquedas.");
  // Limpia claves vacías para no ensuciar el jsonb.
  const clean: SavedSearchCriteria = {};
  if (criteria.q) clean.q = criteria.q;
  if (criteria.category) clean.category = criteria.category;
  if (criteria.priceMin != null) clean.priceMin = criteria.priceMin;
  if (criteria.priceMax != null) clean.priceMax = criteria.priceMax;
  if (criteria.sort) clean.sort = criteria.sort;

  const { data, error } = await supabase
    .from("saved_searches")
    .insert({ user_id: user.id, name: name.trim() || null, criteria: clean, alert_enabled: true })
    .select("id, name, criteria, alert_enabled, created_at, last_run_at, last_notified_at")
    .single();
  if (error) throw error;
  return data as SavedSearch;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { error } = await supabase.from("saved_searches").delete().eq("id", id);
  if (error) throw error;
}

// Activa/desactiva la alerta (notificaciones automáticas) de una búsqueda.
export async function setAlertEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from("saved_searches").update({ alert_enabled: enabled }).eq("id", id);
  if (error) throw error;
}

// Cuenta cuántos avisos coinciden hoy con el criterio (resultados actuales).
export async function countResults(criteria: SavedSearchCriteria): Promise<number> {
  const rows = await searchListings({
    q: criteria.q || undefined,
    category: criteria.category || undefined,
    priceMin: criteria.priceMin,
    priceMax: criteria.priceMax,
    sort: (criteria.sort as never) || "recent",
  });
  return rows.length;
}

// Construye la URL del buscador a partir del criterio guardado.
export function criteriaToSearchUrl(criteria: SavedSearchCriteria): string {
  const p = new URLSearchParams();
  if (criteria.q) p.set("q", criteria.q);
  if (criteria.category) p.set("cat", criteria.category);
  if (criteria.priceMin != null) p.set("min", String(criteria.priceMin));
  if (criteria.priceMax != null) p.set("max", String(criteria.priceMax));
  if (criteria.sort) p.set("sort", criteria.sort);
  const qs = p.toString();
  return `/buscar${qs ? `?${qs}` : ""}`;
}

// Resumen legible del criterio para mostrar en la tarjeta.
export function criteriaLabel(criteria: SavedSearchCriteria): string {
  const parts: string[] = [];
  if (criteria.q) parts.push(`"${criteria.q}"`);
  if (criteria.priceMin != null || criteria.priceMax != null) {
    const min = criteria.priceMin != null ? criteria.priceMin.toLocaleString() : "0";
    const max = criteria.priceMax != null ? criteria.priceMax.toLocaleString() : "∞";
    parts.push(`${min} - ${max}`);
  }
  return parts.join(" · ") || "Cualquier aviso";
}
