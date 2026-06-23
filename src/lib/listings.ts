// Capa de acceso a avisos. Mapea las filas de Supabase (vista listing_cards
// y RPC search_listings) al mismo tipo `Listing` que ya consumen los
// componentes, para NO cambiar el diseño. Si la BD aún no tiene avisos,
// cae a los datos mock para que la UI nunca se vea vacía.
import { supabase } from "@/lib/supabase";
import type { Listing } from "@/data/mockData";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop";

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Fila de la vista listing_cards / RPC search_listings
interface CardRow {
  id: string;
  title: string;
  description: string | null;
  price: number | string;
  currency: string;
  category_id: string;
  location: string | null;
  featured: boolean;
  views: number | null;
  published_at: string | null;
  created_at: string | null;
  advertiser: string | null;
  image_url: string | null;
}

export function mapCard(r: CardRow): Listing {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? "",
    price: Number(r.price) || 0,
    currency: r.currency || "PEN",
    category: r.category_id,
    location: r.location ?? "",
    imageUrl: r.image_url ?? FALLBACK_IMG,
    date: (r.published_at ?? r.created_at ?? new Date().toISOString()).slice(0, 10),
    featured: !!r.featured,
    advertiser: r.advertiser ?? "Anunciante",
    views: Number(r.views) || 0,
  };
}

export type SortKey = "recent" | "price_asc" | "price_desc" | "views";

export interface SearchFilters {
  q?: string;
  category?: string;
  subcategory?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  sort?: SortKey;
}

// Lista de avisos para home / destacados.
export async function fetchListings(opts?: { limit?: number; sort?: SortKey }): Promise<Listing[]> {
  try {
    let query = supabase.from("listing_cards").select("*").limit(opts?.limit ?? 8);
    if (opts?.sort === "price_asc") query = query.order("price", { ascending: true });
    else if (opts?.sort === "price_desc") query = query.order("price", { ascending: false });
    else if (opts?.sort === "views") query = query.order("views", { ascending: false });
    else query = query.order("published_at", { ascending: false, nullsFirst: false });

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => mapCard(r as CardRow));
  } catch {
    return [];
  }
}

// Avisos por una lista de ids (para Favoritos del usuario).
export async function fetchListingsByIds(ids: string[]): Promise<Listing[]> {
  const realIds = ids.filter(isUuid);
  if (realIds.length === 0) return [];
  try {
    const { data, error } = await supabase.from("listing_cards").select("*").in("id", realIds);
    if (error) throw error;
    return (data ?? []).map((r) => mapCard(r as CardRow));
  } catch {
    return [];
  }
}

// Todas las imágenes reales de un aviso (ordenadas), para la galería del detalle.
export async function fetchListingImages(listingId: string): Promise<string[]> {
  if (!isUuid(listingId)) return [];
  try {
    const { data, error } = await supabase
      .from("listing_images")
      .select("url, sort_order")
      .eq("listing_id", listingId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: { url: string }) => r.url).filter(Boolean);
  } catch {
    return [];
  }
}

// Detalle de un aviso por id.
export async function fetchListingById(id: string): Promise<Listing | null> {
  if (!isUuid(id)) return null;
  try {
    const { data } = await supabase.from("listing_cards").select("*").eq("id", id).maybeSingle();
    if (data) return mapCard(data as CardRow);
  } catch {
    /* sin datos */
  }
  return null;
}

// Buscador con filtros combinados (usa el RPC search_listings).
export async function searchListings(f: SearchFilters): Promise<Listing[]> {
  try {
    const { data, error } = await supabase.rpc("search_listings", {
      p_query: f.q || null,
      p_category: f.category || null,
      p_subcategory: f.subcategory || null,
      p_price_min: f.priceMin ?? null,
      p_price_max: f.priceMax ?? null,
      p_currency: f.currency || null,
      p_sort: f.sort || "recent",
      p_limit: 48,
      p_offset: 0,
    });
    if (error) throw error;
    return (data ?? []).map((r) => mapCard(r as CardRow));
  } catch {
    return [];
  }
}

// Estados de un aviso tal como se guardan en la BD.
export type ListingStatus =
  | "draft" | "pending" | "active" | "paused" | "expired" | "rejected" | "sold";

export interface MyListing extends Listing {
  status: ListingStatus;
}

// Avisos del anunciante actual (todos sus estados). Usa la tabla `listings`
// directamente: la RLS deja al dueño ver los suyos aunque no estén activos.
export async function fetchMyListings(): Promise<MyListing[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  try {
    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, title, description, price, currency, category_id, location, featured, views, status, published_at, created_at, listing_images(url, sort_order)"
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any): MyListing => {
      const imgs = (r.listing_images ?? [])
        .slice()
        .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      return {
        id: r.id,
        title: r.title,
        description: r.description ?? "",
        price: Number(r.price) || 0,
        currency: r.currency || "PEN",
        category: r.category_id,
        location: r.location ?? "",
        imageUrl: imgs[0]?.url || FALLBACK_IMG,
        date: (r.published_at ?? r.created_at ?? new Date().toISOString()).slice(0, 10),
        featured: !!r.featured,
        advertiser: "",
        views: Number(r.views) || 0,
        status: r.status as ListingStatus,
      };
    });
  } catch {
    return [];
  }
}

// Campos editables de un aviso desde "Mis avisos".
export interface ListingPatch {
  title?: string;
  description?: string;
  price?: number;
  currency?: string;
  location?: string;
}

// Actualiza un aviso del usuario (RLS permite editar solo los propios).
export async function updateListing(id: string, patch: ListingPatch): Promise<void> {
  const { error } = await supabase.from("listings").update(patch).eq("id", id);
  if (error) throw error;
}

// Cambia el estado (pausar/activar) de un aviso propio.
export async function setListingStatus(id: string, status: ListingStatus): Promise<void> {
  const { error } = await supabase.from("listings").update({ status }).eq("id", id);
  if (error) throw error;
}

// Elimina un aviso del usuario (RLS permite borrar solo los propios).
export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from("listings").delete().eq("id", id);
  if (error) throw error;
}

// REQ-08: registra una vista / clic (no rompe si el visitante es anónimo).
export async function trackEvent(listingId: string, type: "view" | "contact_click" | "phone_click") {
  if (!isUuid(listingId)) return;
  let visitor = "";
  try {
    visitor = localStorage.getItem("effe_visitor") || "";
    if (!visitor) {
      visitor = crypto.randomUUID();
      localStorage.setItem("effe_visitor", visitor);
    }
  } catch {
    /* ignore */
  }
  try {
    await supabase.rpc("track_event", { p_listing: listingId, p_type: type, p_visitor: visitor });
  } catch {
    /* best-effort */
  }
}
