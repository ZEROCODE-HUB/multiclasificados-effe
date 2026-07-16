// Capa de acceso a avisos. Mapea las filas de Supabase (vista listing_cards
// y RPC search_listings) al mismo tipo `Listing` que ya consumen los
// componentes, para NO cambiar el diseño. Si la BD aún no tiene avisos,
// cae a los datos mock para que la UI nunca se vea vacía.
import { supabase } from "@/lib/supabase";
import type { Listing } from "@/data/mockData";

export const FALLBACK_IMG =
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
  condition: string | null;
  category_id: string;
  location: string | null;
  lat: number | string | null;
  lng: number | string | null;
  featured: boolean;
  urgent: boolean | null;
  confidential: boolean | null;
  views: number | null;
  published_at: string | null;
  created_at: string | null;
  expires_at: string | null;
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
    condition: (r.condition ?? "na") as ListingCondition,
    category: r.category_id,
    location: r.location ?? "",
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    imageUrl: r.image_url ?? FALLBACK_IMG,
    date: (r.published_at ?? r.created_at ?? new Date().toISOString()).slice(0, 10),
    featured: !!r.featured,
    urgent: !!r.urgent,
    confidential: !!r.confidential,
    advertiser: r.advertiser ?? "Anunciante",
    views: Number(r.views) || 0,
    expiresAt: r.expires_at ?? null,
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
    // Prioridad por modalidad (documento): Urgente primero, luego Destacado, y
    // dentro de cada grupo el orden pedido.
    let query = supabase.from("listing_cards").select("*").limit(opts?.limit ?? 8)
      .order("urgent", { ascending: false, nullsFirst: false })
      .order("featured", { ascending: false, nullsFirst: false });
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

// Todos los avisos publicados de un anunciante (para "Ver todos sus avisos").
export async function fetchListingsByOwner(ownerId: string): Promise<Listing[]> {
  if (!isUuid(ownerId)) return [];
  try {
    const { data, error } = await supabase
      .from("listing_cards")
      .select("*")
      .eq("owner_id", ownerId)
      .order("published_at", { ascending: false, nullsFirst: false });
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

// Enlace (firmado, temporal) al PDF adjunto del aviso, si tiene uno. Cualquiera
// puede pedirlo desde el detalle (política listing_docs_public_read). Devuelve
// null si el aviso no tiene documento.
export async function fetchListingDocumentUrl(id: string): Promise<string | null> {
  if (!isUuid(id)) return null;
  try {
    const { data } = await supabase.from("listings").select("document_url").eq("id", id).maybeSingle();
    const path = (data as { document_url?: string | null } | null)?.document_url;
    if (!path) return null;
    const { data: signed } = await supabase.storage.from("listing-docs").createSignedUrl(path, 60 * 60);
    return signed?.signedUrl ?? null;
  } catch {
    return null;
  }
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

export type ListingCondition = "nuevo" | "usado" | "na";

// Tiempo que le queda a un aviso activo antes de caducar, listo para mostrar.
// `tone` gradúa el color: normal (>7 días), atención (≤7 días) y urgente (<1 día
// o ya vencido). Devuelve null si no hay fecha de vencimiento.
export interface ExpiryInfo { text: string; tone: "normal" | "warning" | "urgent" }
export function expiryInfo(expiresAt: string | null, now: number = Date.now()): ExpiryInfo | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { text: "Vencido", tone: "urgent" };

  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (days >= 1) text = `Vence en ${days} ${days === 1 ? "día" : "días"}`;
  else if (hours >= 1) text = `Vence en ${hours} ${hours === 1 ? "hora" : "horas"}`;
  else text = `Vence en ${mins} ${mins === 1 ? "minuto" : "minutos"}`;

  const tone: ExpiryInfo["tone"] = days >= 7 ? "normal" : days >= 1 ? "warning" : "urgent";
  return { text, tone };
}

// Cuenta regresiva del adicional "Urgente": cuánto le queda al aviso antes de
// caducar (el urgente solo se vende en planes ≤7 días, así que es una urgencia
// real por horas). `short` va en la insignia de la tarjeta; `long` en el
// detalle. Devuelve null si no hay fecha de vencimiento.
export interface UrgentTimeLeft { short: string; long: string; hours: number; expired: boolean }
export function urgentTimeLeft(expiresAt: string | null, now: number = Date.now()): UrgentTimeLeft | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { short: "0h", long: "Urgencia vencida", hours: 0, expired: true };

  const totalMin = Math.floor(ms / 60000);
  const totalHours = Math.floor(totalMin / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = totalMin % 60;

  // Insignia: enfocada en horas y compacta ("47h", o "45m" en la última hora).
  const short = totalHours >= 1 ? `${totalHours}h` : `${mins}m`;
  // Detalle: desglose legible.
  const long =
    days >= 1 ? `${days}d ${hours}h ${mins}m`
    : totalHours >= 1 ? `${totalHours}h ${mins}m`
    : `${mins}m`;
  return { short, long, hours: totalHours, expired: false };
}

export interface MyListing extends Listing {
  status: ListingStatus;
  expiresAt: string | null;
  condition: ListingCondition;
  // Plan elegido antes de pagar (ver 0041_listing_draft_plan.sql). Solo tiene
  // valor en los borradores: en un aviso publicado el plan real está en su orden.
  planDurationDays: number | null;
  planQuantity: number | null;
  planExtras: Record<string, number | undefined> | null;
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
        "id, title, description, price, currency, category_id, condition, location, lat, lng, featured, urgent, confidential, views, status, published_at, expires_at, created_at, plan_duration_days, plan_quantity, plan_extras, listing_images(url, sort_order)"
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
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        imageUrl: imgs[0]?.url || FALLBACK_IMG,
        date: (r.published_at ?? r.created_at ?? new Date().toISOString()).slice(0, 10),
        featured: !!r.featured,
        urgent: !!r.urgent,
        confidential: !!r.confidential,
        advertiser: "",
        views: Number(r.views) || 0,
        status: r.status as ListingStatus,
        expiresAt: r.expires_at ?? null,
        condition: (r.condition ?? "na") as ListingCondition,
        planDurationDays: r.plan_duration_days != null ? Number(r.plan_duration_days) : null,
        planQuantity: r.plan_quantity != null ? Number(r.plan_quantity) : null,
        planExtras: (r.plan_extras ?? null) as Record<string, number | undefined> | null,
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
  lat?: number | null;
  lng?: number | null;
  category_id?: string;
  condition?: ListingCondition;
}

// Actualiza un aviso del usuario (RLS permite editar solo los propios).
export async function updateListing(id: string, patch: ListingPatch): Promise<void> {
  const { error } = await supabase.from("listings").update(patch).eq("id", id);
  if (error) throw error;
}

// Reemplaza la imagen principal (sort_order 0) de un aviso propio: sube el
// archivo al bucket listing-images (carpeta = uid/listingId, exigido por RLS),
// borra la portada anterior y registra la nueva. Devuelve la URL pública.
export async function replaceMainListingPhoto(listingId: string, file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa.");
  const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40);
  const path = `${user.id}/${listingId}/0-${Date.now()}-${sanitize(file.name)}`;

  const { error: upErr } = await supabase.storage
    .from("listing-images")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from("listing-images").getPublicUrl(path);
  const url = pub.publicUrl;

  // Reemplaza la portada: quita la fila anterior con sort_order 0 y agrega la nueva.
  await supabase.from("listing_images").delete().eq("listing_id", listingId).eq("sort_order", 0);
  const { error: insErr } = await supabase
    .from("listing_images")
    .insert({ listing_id: listingId, storage_path: path, url, sort_order: 0 });
  if (insErr) throw insErr;

  return url;
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

// Teléfono del anunciante de un aviso, o null si no corresponde mostrarlo.
// Las reglas viven en la RPC (exige sesión, nunca revela avisos confidenciales)
// porque la RLS de profiles impide leer el perfil ajeno desde el cliente.
export async function fetchAdvertiserPhone(listingId: string): Promise<string | null> {
  if (!isUuid(listingId)) return null;
  try {
    const { data, error } = await supabase.rpc("listing_advertiser_phone", { p_listing_id: listingId });
    if (error) throw error;
    return (data as string | null)?.trim() || null;
  } catch {
    return null;
  }
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
