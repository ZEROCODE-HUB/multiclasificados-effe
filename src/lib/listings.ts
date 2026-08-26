// Capa de acceso a avisos. Mapea las filas de Supabase (vista listing_cards
// y RPC search_listings) al mismo tipo `Listing` que ya consumen los
// componentes, para NO cambiar el diseño. Si la BD aún no tiene avisos,
// cae a los datos mock para que la UI nunca se vea vacía.
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/compressImage";
import type { Listing } from "@/data/mockData";

// La imagen de reserva vive en @/lib/imagenPorDefecto (donde está también la
// configurable que la puede sustituir). Se reexporta desde aquí porque es donde
// la busca medio repositorio.
export { FALLBACK_IMG } from "@/lib/imagenPorDefecto";
import { imagenPorDefecto } from "@/lib/imagenPorDefecto";

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
  department: string | null;
  country?: string | null;
  video_count?: number | null;
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
  advertiser_verified: boolean | null;
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
    department: r.department ?? null,
    // Los avisos anteriores al soporte de países son peruanos.
    country: r.country ?? "PE",
    videoCount: Number(r.video_count ?? 0),
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    // `||` y no `??`: una cadena vacía también significa "sin imagen", y con
    // `??` se colaría hasta el <img>, que pintaría el icono de imagen rota.
    imageUrl: r.image_url || imagenPorDefecto(),
    date: (r.published_at ?? r.created_at ?? new Date().toISOString()).slice(0, 10),
    featured: !!r.featured,
    urgent: !!r.urgent,
    confidential: !!r.confidential,
    advertiser: r.advertiser ?? "Anunciante",
    // Solo el sello del equipo de administración. Una vista antigua (anterior a
    // la 0087) no trae la columna: sin dato, no hay sello. Nunca al revés.
    advertiserVerified: !!r.advertiser_verified,
    views: Number(r.views) || 0,
    expiresAt: r.expires_at ?? null,
  };
}

export type SortKey = "recent" | "price_asc" | "price_desc" | "views" | "distance";

export interface SearchFilters {
  q?: string;
  category?: string;
  subcategory?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  sort?: SortKey;
  /**
   * Código de departamento del INEI (2 dígitos); "15" agrupa Lima y Callao.
   * Sin él se busca en todo el país. Es el único filtro de ubicación: se
   * comparaba por distancia y se cambió por esto, que es exacto y predecible.
   */
  department?: string;
  /**
   * País del aviso (ISO-3166-1 alpha-2). Por defecto "PE": los avisos de
   * siempre son peruanos y quien no toque este filtro ve lo mismo que antes.
   * Vacío o null busca en todos los países.
   */
  country?: string;
  /**
   * Ubicación del dispositivo, solo con permiso concedido. NO filtra nada: se
   * usa únicamente para ordenar cuando `sort` es "distance".
   */
  lat?: number;
  lng?: number;
  /** Cuántos avisos traer. Nunca más de TOPE_RESULTADOS. */
  limit?: number;
}

/**
 * Tope de avisos que se piden de una vez.
 *
 * El buscador pagina en el navegador sobre la lista que recibe, así que este
 * número no es "cuántos se ven por página": es cuántos EXISTEN para el usuario.
 * Estaba en 48 y por eso con 89 avisos publicados el buscador decía "48 avisos
 * disponibles" y los otros 41 no había forma de alcanzarlos, ni paginando.
 *
 * 500 no es un número mágico: es lo bastante alto para que hoy no se roce y lo
 * bastante bajo para no volcar la base entera en una respuesta. Cuando se toque
 * el tope, la interfaz lo dice en vez de fingir que eso es todo lo que hay
 * (ver `topeAlcanzado`).
 */
export const TOPE_RESULTADOS = 500;

/** True si la lista viene recortada por el tope y hay más avisos sin mostrar. */
export const topeAlcanzado = (n: number): boolean => n >= TOPE_RESULTADOS;

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

/** Por qué un aviso no se puede enseñar. */
export interface AvisoNoVisible {
  /** false = no existe (o no es tuyo y no está activo). */
  existe: boolean;
  estado?: ListingStatus;
  /** true si es del usuario con sesión: entonces se le puede ofrecer renovar. */
  esMio?: boolean;
  titulo?: string;
}

/**
 * Por qué no se ve un aviso que `fetchListingById` no devolvió.
 *
 * `listing_cards` es la vista pública y solo trae los ACTIVOS. Un aviso vencido
 * desaparece de ahí, y la ficha se quedaba con un aviso vacío para siempre:
 * imagen rota, sin título, sin descripción y con "Precio a convenir" porque el
 * precio del hueco es 0. Parecía un aviso roto, no uno vencido.
 *
 * Y no es un caso raro: el correo de "tu aviso está por vencer" enlaza al aviso,
 * así que basta con abrirlo un rato después para caer justo aquí.
 *
 * La tabla `listings` sí deja al DUEÑO leer los suyos en cualquier estado
 * (política `listings_select_public`: `status = 'active' or owner_id = auth.uid()
 * or is_staff(...)`), así que con una consulta más se puede distinguir "este
 * aviso venció, renuévalo" de "este enlace no lleva a ninguna parte".
 */
export async function porQueNoSeVeElAviso(id: string): Promise<AvisoNoVisible> {
  if (!isUuid(id)) return { existe: false };
  try {
    const { data } = await supabase
      .from("listings").select("status, owner_id, title").eq("id", id).maybeSingle();
    if (!data) return { existe: false };
    const { data: sesion } = await supabase.auth.getUser();
    const r = data as { status?: string; owner_id?: string; title?: string };
    return {
      existe: true,
      estado: r.status as ListingStatus | undefined,
      esMio: !!sesion?.user?.id && sesion.user.id === r.owner_id,
      titulo: r.title ?? undefined,
    };
  } catch {
    // Si la consulta falla no se puede afirmar que no exista: se trata como
    // "no visible" a secas, que es lo único que sabemos con certeza.
    return { existe: false };
  }
}

// Enlace (firmado, temporal) al PDF adjunto del aviso, si tiene uno. Cualquiera
// puede pedirlo desde el detalle (política listing_docs_public_read). Devuelve
// null si el aviso no tiene documento.
export interface VideoDelAviso {
  id: string;
  url: string;
  duracion: number | null;
}

/** Vídeos de un aviso, en el orden en que los subió su dueño. */
export async function fetchListingVideos(id: string): Promise<VideoDelAviso[]> {
  if (!isUuid(id)) return [];
  try {
    const { data, error } = await supabase
      .from("listing_videos")
      .select("id, url, duration_seconds")
      .eq("listing_id", id)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Array<Record<string, unknown>>).map((v) => ({
      id: String(v.id),
      url: String(v.url),
      duracion: v.duration_seconds != null ? Number(v.duration_seconds) : null,
    }));
  } catch {
    // Un aviso sin vídeos y un fallo al leerlos se ven igual: no es motivo para
    // romper la ficha.
    return [];
  }
}

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

/**
 * ¿El error es "esa función no acepta ese parámetro"?
 *
 * Postgres contesta 42883 (función inexistente) y PostgREST PGRST202 cuando la
 * firma no coincide. Pasa en la ventana entre desplegar la web y aplicar la
 * migración, y no debe verse como "no hay avisos".
 */
function esParametroDesconocido(error: { code?: string; message?: string }): boolean {
  const code = error?.code ?? "";
  const msg = (error?.message ?? "").toLowerCase();
  return code === "PGRST202" || code === "42883" || msg.includes("p_country");
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
      // El departamento también gobierna la prioridad: un aviso Urgente de otro
      // departamento aparece, pero no encabeza la búsqueda de quien mira este.
      p_department: f.department || null,
      p_country: f.country === undefined ? "PE" : (f.country || null),
      p_sort: f.sort || "recent",
      p_lat: f.lat ?? null,
      p_lng: f.lng ?? null,
      p_limit: Math.min(f.limit ?? TOPE_RESULTADOS, TOPE_RESULTADOS),
      p_offset: 0,
    });
    if (error) {
      // La base puede ir por detrás del despliegue: mientras la migración de
      // países no esté aplicada, `p_country` no existe y la llamada entera
      // falla. En vez de dejar el buscador vacío —que es como se ve un error
      // aquí— se repite la consulta sin ese filtro.
      if (esParametroDesconocido(error)) {
        const { data: previo, error: err2 } = await supabase.rpc("search_listings", {
          p_query: f.q || null,
          p_category: f.category || null,
          p_subcategory: f.subcategory || null,
          p_price_min: f.priceMin ?? null,
          p_price_max: f.priceMax ?? null,
          p_currency: f.currency || null,
          p_department: f.department || null,
          p_sort: f.sort || "recent",
          p_lat: f.lat ?? null,
          p_lng: f.lng ?? null,
          p_limit: Math.min(f.limit ?? TOPE_RESULTADOS, TOPE_RESULTADOS),
          p_offset: 0,
        });
        if (err2) throw err2;
        return (previo ?? []).map((r) => mapCard(r as CardRow));
      }
      throw error;
    }
    return (data ?? []).map((r) => mapCard(r as CardRow));
  } catch (e) {
    // Se sigue devolviendo una lista vacía —el buscador no debe romperse— pero
    // el motivo queda en la consola. Sin esto, un fallo del servidor se ve
    // igual que "no hay avisos con esos filtros", y eso cuesta horas de
    // encontrar: es lo que pasó al filtrar por departamento contra una base de
    // datos donde aún no estaba aplicada la migración que añade ese parámetro.
    console.error("[listings] falló search_listings:", e);
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
  // Motivo de rechazo que dejó moderación (solo en avisos con status 'rejected').
  rejectionReason: string | null;
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
        "id, title, description, price, currency, category_id, condition, location, lat, lng, featured, urgent, confidential, views, status, rejection_reason, published_at, expires_at, created_at, plan_duration_days, plan_quantity, plan_extras, listing_images(url, sort_order)"
      )
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    // La fila tal como la devuelve la consulta de arriba, con las imágenes
    // anidadas. Estaba como `any`, que además de apagar los tipos no dejaba por
    // escrito qué columnas se piden.
    interface FilaImagen { url: string; sort_order?: number | null }
    interface FilaAviso {
      id: string; title: string; description?: string | null;
      price?: number | string | null; currency?: string | null; category_id: string;
      condition?: string | null; location?: string | null;
      lat?: number | string | null; lng?: number | string | null;
      featured?: boolean | null; urgent?: boolean | null; confidential?: boolean | null;
      views?: number | null; status: string; rejection_reason?: string | null;
      published_at?: string | null; expires_at?: string | null; created_at?: string | null;
      plan_duration_days?: number | null; plan_quantity?: number | null;
      plan_extras?: Record<string, number | boolean> | null;
      listing_images?: FilaImagen[] | null;
    }
    return (data as unknown as FilaAviso[] ?? []).map((r): MyListing => {
      const imgs = (r.listing_images ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
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
        imageUrl: imgs[0]?.url || imagenPorDefecto(),
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
        rejectionReason: r.rejection_reason ?? null,
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
  department?: string | null;
  location?: string;
  lat?: number | null;
  lng?: number | null;
  category_id?: string;
  condition?: ListingCondition;
}

/**
 * Qué adjuntos tiene de verdad un aviso guardado.
 *
 * Hace falta antes de cobrar: los adicionales se contratan al armar el paquete
 * y se suben después, así que un borrador puede tener tres videos pagados y
 * ninguno subido. Ver `adicionalesQueFaltan`.
 */
export async function contarAdjuntosDelAviso(listingId: string): Promise<{
  imagenesExtra: number;
  tienePdf: boolean;
  videos: number;
}> {
  const [imgs, doc, vids] = await Promise.all([
    // sort_order 0 es la portada; las adicionales son las demás.
    supabase.from("listing_images").select("sort_order", { count: "exact", head: true })
      .eq("listing_id", listingId).gt("sort_order", 0),
    supabase.from("listings").select("document_url").eq("id", listingId).maybeSingle(),
    supabase.from("listing_videos").select("id", { count: "exact", head: true })
      .eq("listing_id", listingId),
  ]);

  return {
    imagenesExtra: imgs.count ?? 0,
    tienePdf: !!(doc.data as { document_url?: string | null } | null)?.document_url,
    // La tabla de videos es de la 0115: si aún no está aplicada, la consulta
    // falla y se cuenta como cero en vez de bloquear la publicación.
    videos: vids.error ? 0 : (vids.count ?? 0),
  };
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
  const compressed = await compressImage(file); // WebP ~1600px antes de subir
  const path = `${user.id}/${listingId}/0-${Date.now()}-${sanitize(compressed.name)}`;

  const { error: upErr } = await supabase.storage
    .from("listing-images")
    .upload(path, compressed, { upsert: true, cacheControl: "2592000", contentType: compressed.type || undefined });
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

/**
 * Cuántos avisos activos hay en cada país, para el filtro de búsqueda.
 *
 * Se pide UNA vez al montar el filtro, no en cada tecla: el número no cambia de
 * un segundo a otro y la lista tiene 249 entradas. Si falla se devuelve vacío y
 * el selector funciona igual, solo que sin números — como la configuración de
 * Yape/Plin: un adorno útil no puede tumbar la pantalla.
 */
export async function avisosPorPais(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase.rpc("avisos_activos_por_pais");
    if (error) throw error;
    const conteo: Record<string, number> = {};
    for (const fila of (data ?? []) as Array<{ country: string; total: number | string }>) {
      if (fila?.country) conteo[String(fila.country).toUpperCase()] = Number(fila.total ?? 0);
    }
    return conteo;
  } catch {
    return {};
  }
}
