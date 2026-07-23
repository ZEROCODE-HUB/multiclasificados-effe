// Capa de datos del panel Admin / Superadmin.
// Llama a las RPCs security-definer de Supabase (migración 0022_admin_panel)
// y, si la BD aún no responde / está vacía, cae a los datos mock para que el
// diseño nunca se vea roto. Solo cambia el ORIGEN de los datos, no la UI.
import { supabase } from "@/lib/supabase";
import {
  adminKpis, auditLogs as mockAudit, adminUsers as mockUsers,
  adminListings as mockListings, reportedConversations as mockReports,
  revenueSeries as mockSeries, categoryDistribution as mockCats,
  recentActivity as mockActivity,
} from "@/data/adminMockData";
import { loadInvoices } from "@/lib/pricing";
import {
  auditActionLabel, auditEntityDescription, auditEntityLabel, auditEntityName,
  type EntityNames,
} from "@/lib/auditLabels";

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ¿Hay una sesión iniciada? Si la hay (staff), preferimos el dato real aunque
// la tabla esté vacía; el mock queda solo para el modo demo sin sesión.
async function isAuthed(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getUser();
    return !!data.user;
  } catch { return false; }
}

// ------------------------------------------------------------------ Dashboard
export interface AdminStats {
  users: number; active_listings: number; pending_listings: number;
  sold_listings: number; total_listings: number; reports_open: number; revenue: number;
}

export async function fetchAdminStats(): Promise<{ data: AdminStats; real: boolean }> {
  try {
    const { data, error } = await supabase.rpc("admin_stats");
    if (error) throw error;
    if (data && Object.keys(data).length) return { data: data as AdminStats, real: true };
  } catch { /* fallback */ }
  // Con sesión de staff NO mostramos KPIs demo: si el RPC no respondió, ceros
  // reales (el mock queda solo para el modo demo sin sesión).
  if (await isAuthed()) {
    return {
      real: true,
      data: {
        users: 0, active_listings: 0, pending_listings: 0, sold_listings: 0,
        total_listings: 0, reports_open: 0, revenue: 0,
      },
    };
  }
  return {
    real: false,
    data: {
      users: adminKpis.users, active_listings: adminKpis.activeListings,
      pending_listings: adminKpis.pendingListings, sold_listings: 0,
      total_listings: adminKpis.activeListings, reports_open: adminKpis.reportsOpen,
      revenue: adminKpis.revenue,
    },
  };
}

// Rango del gráfico de crecimiento. Los valores viajan tal cual a la RPC.
export type GrowthRange = "7d" | "30d" | "6m" | "12m" | "all";

export const GROWTH_RANGES: { value: GrowthRange; label: string }[] = [
  { value: "7d", label: "Esta semana" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "all", label: "Histórico" },
];

// Un punto de la serie de crecimiento. `avisos`/`postulaciones` se agregaron
// para los reportes por tipo del admin (EFFE-044/059/060).
export interface GrowthPoint {
  mes: string;
  ingresos: number;
  usuarios: number;
  avisos: number;
  postulaciones: number;
}

export async function fetchGrowthSeries(range: GrowthRange = "6m"): Promise<GrowthPoint[]> {
  try {
    const { data, error } = await supabase.rpc("admin_growth_series", { p_range: range });
    if (error) throw error;
    if (data?.length) return (data as any[]).map((r) => ({
      mes: r.mes,
      ingresos: Number(r.ingresos) || 0,
      usuarios: Number(r.usuarios) || 0,
      avisos: Number(r.avisos) || 0,
      postulaciones: Number(r.postulaciones) || 0,
    }));
  } catch { /* fallback */ }
  // Con sesión de staff: sin datos reales → serie vacía, nunca la demo.
  if (await isAuthed()) return [];
  // Demo (sin sesión): la serie de ejemplo son 6 meses fijos y no reacciona al
  // rango; el filtro solo tiene efecto real contra la base. La demo no trae
  // avisos/postulaciones → se completan en 0.
  return mockSeries.map((r: { mes: string; ingresos: number; usuarios: number }) => ({
    mes: r.mes,
    ingresos: Number(r.ingresos) || 0,
    usuarios: Number(r.usuarios) || 0,
    avisos: 0,
    postulaciones: 0,
  }));
}

// ------------------------------------------------------------- Transacciones de crédito
export interface AdminCreditTx {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  type: "purchase" | "spend";
  credits: number;
  description: string | null;
  listing_title: string | null;
  created_at: string;
}

// Tamaño de página del historial de transacciones (paginación en el servidor).
export const CREDIT_TX_PAGE_SIZE = 20;

// EFFE-054: historial de transacciones de crédito de TODOS los usuarios, con
// búsqueda por usuario/correo, filtro de fechas y paginación. El RPC exige el
// permiso 'Reportes'/'edit' (ver permissions.ts); sin ese permiso devuelve vacío.
export async function fetchAdminCreditTransactions(opts: {
  search?: string; from?: string; to?: string; page?: number;
}): Promise<{ data: AdminCreditTx[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  try {
    const { data, error } = await supabase.rpc("admin_credit_transactions", {
      p_search: opts.search || null,
      p_from: opts.from || null,
      p_to: opts.to || null,
      p_limit: CREDIT_TX_PAGE_SIZE,
      p_offset: (page - 1) * CREDIT_TX_PAGE_SIZE,
    });
    if (error) throw error;
    const rows = (data ?? []) as any[];
    const total = rows.length ? Number(rows[0].total_count) || 0 : 0;
    return {
      data: rows.map((r): AdminCreditTx => ({
        id: r.id,
        user_id: r.user_id,
        full_name: r.full_name ?? "—",
        email: r.email ?? "",
        type: r.type,
        credits: Number(r.credits) || 0,
        description: r.description ?? null,
        listing_title: r.listing_title ?? null,
        created_at: r.created_at,
      })),
      total,
    };
  } catch {
    return { data: [], total: 0 };
  }
}

// ------------------------------------------------------------------ Comprobantes
// Boletas y facturas de TODOS los anunciantes (panel comercial admin/superadmin).
// La RLS permite a staff leer todos los comprobantes; unimos hasta el aviso para
// mostrar su título. En modo demo (sin sesión) cae a los comprobantes locales.
export interface AdminInvoice {
  id: string;
  number: string;
  type: "boleta" | "factura";
  date: string;
  advertiser: string;
  email: string;
  docType: string | null;
  docNumber: string | null;
  factilizaData: Record<string, unknown> | null;
  listingTitle: string;
  amount: number;
}

// Forma (laxa) de la fila que devuelve PostgREST con el join anidado. Las
// relaciones pueden venir como objeto o como array según la cardinalidad.
interface RelTitle { title?: string }
interface RelOrderListing { listings?: RelTitle | RelTitle[] }
interface RelOrder { order_listings?: RelOrderListing | RelOrderListing[] }
interface InvoiceRow {
  id: string;
  number: string;
  type: string;
  email: string | null;
  advertiser_name: string | null;
  doc_type: string | null;
  doc_number: string | null;
  factiliza_data: Record<string, unknown> | null;
  amount: number | string;
  detail: string | null;
  issued_at: string;
  orders?: RelOrder | RelOrder[] | null;
}

export async function fetchAllInvoices(): Promise<{ data: AdminInvoice[]; real: boolean }> {
  try {
    if (await isAuthed()) {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, number, type, email, advertiser_name, doc_type, doc_number, factiliza_data, amount, detail, issued_at, " +
            "orders ( order_listings ( listings ( title ) ) )"
        )
        .order("issued_at", { ascending: false });
      if (error) throw error;
      const first = <T,>(v: T | T[] | null | undefined): T | undefined =>
        Array.isArray(v) ? v[0] : v ?? undefined;
      const rows: AdminInvoice[] = ((data ?? []) as unknown as InvoiceRow[]).map((r) => {
        const order = first(r.orders);
        const ol = first(order?.order_listings);
        const title = first(ol?.listings)?.title;
        return {
          id: r.id,
          number: r.number,
          type: r.type === "factura" ? "factura" : "boleta",
          date: r.issued_at,
          advertiser: r.advertiser_name || "—",
          email: r.email || "—",
          docType: r.doc_type ?? null,
          docNumber: r.doc_number ?? null,
          factilizaData: r.factiliza_data ?? null,
          listingTitle: title || r.detail || "—",
          amount: Number(r.amount) || 0,
        };
      });
      return { data: rows, real: true };
    }
  } catch {
    /* fallback a comprobantes locales (modo demo) */
  }
  const local: AdminInvoice[] = loadInvoices().map((l) => ({
    id: l.id,
    number: l.number,
    type: "boleta",
    date: l.date,
    advertiser: l.advertiser,
    email: l.email,
    docType: null,
    docNumber: (l as { docNumber?: string | null }).docNumber ?? null,
    factilizaData: null,
    listingTitle: l.listingTitle,
    amount: l.amount,
  }));
  return { data: local, real: false };
}

// ------------------------------------------------------------------ Categorías
export interface AdminCategory {
  id: string; name: string; icon: string; sort_order: number; active: boolean;
  // Si es false, el formulario de publicar oculta el campo "Condición".
  condition_enabled: boolean;
  count: number;
}

// Categorías reales (tabla categories) + nº de avisos por categoría.
export async function fetchCategories(): Promise<{ data: AdminCategory[]; real: boolean }> {
  try {
    const { data: cats, error } = await supabase
      .from("categories")
      .select("id, name, icon, sort_order, active, condition_enabled")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    if (cats && (cats.length || (await isAuthed()))) {
      const { data: ls } = await supabase.from("listings").select("category_id");
      const counts: Record<string, number> = {};
      (ls ?? []).forEach((r: any) => { counts[r.category_id] = (counts[r.category_id] ?? 0) + 1; });
      const rows: AdminCategory[] = (cats as any[]).map((c) => ({
        id: c.id, name: c.name, icon: c.icon, sort_order: c.sort_order, active: c.active,
        condition_enabled: c.condition_enabled !== false,
        count: counts[c.id] ?? 0,
      }));
      return { data: rows, real: true };
    }
  } catch { /* fallback */ }
  // Modo demo (sin sesión): set base de categorías con icono como texto.
  const fallback: AdminCategory[] = [
    { id: "inmuebles", name: "Inmuebles", icon: "Home", sort_order: 0, active: true, condition_enabled: true, count: 0 },
    { id: "vehiculos", name: "Vehículos", icon: "Car", sort_order: 1, active: true, condition_enabled: true, count: 0 },
    { id: "empleos", name: "Empleos", icon: "Briefcase", sort_order: 2, active: true, condition_enabled: false, count: 0 },
    { id: "tecnologia", name: "Tecnología", icon: "Smartphone", sort_order: 3, active: true, condition_enabled: true, count: 0 },
    { id: "productos", name: "Productos", icon: "Package", sort_order: 4, active: true, condition_enabled: true, count: 0 },
    { id: "servicios", name: "Servicios", icon: "Wrench", sort_order: 5, active: true, condition_enabled: false, count: 0 },
  ];
  return { data: fallback, real: false };
}

// Genera un slug/id válido a partir del nombre (sin tildes ni espacios).
export function slugify(name: string): string {
  return name.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function createCategory(input: { name: string; icon: string; sort_order: number; condition_enabled?: boolean }) {
  const id = slugify(input.name);
  if (!id) throw new Error("Nombre de categoría inválido.");
  const { error } = await supabase.from("categories").insert({
    id, name: input.name.trim(), icon: input.icon || "Tag", sort_order: input.sort_order, active: true,
    condition_enabled: input.condition_enabled ?? true,
  });
  if (error) throw error;
  return id;
}

export async function updateCategory(id: string, patch: { name?: string; icon?: string; active?: boolean; condition_enabled?: boolean }) {
  const { error } = await supabase.from("categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// Persiste el orden de las tarjetas: `ids` viene en el orden visible y su
// posición pasa a ser el `sort_order` (1-based, como el seed).
export async function reorderCategories(ids: string[]) {
  const results = await Promise.all(
    ids.map((id, i) =>
      supabase.from("categories").update({ sort_order: i + 1 }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

// Tiempo relativo en español a partir de un timestamp ISO.
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "Hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Ayer" : `Hace ${d} días`;
}

// Los `audit_logs` guardan solo el ID de la entidad afectada. Resuelve de una
// vez los IDs de todas las filas a nombres legibles (usuario → correo,
// aviso → título) para no consultar la BD fila por fila.
async function resolveEntityNames(
  logs: { entity_type?: string | null; entity_id?: string | null }[],
): Promise<EntityNames> {
  const idsOfType = (type: string) =>
    [...new Set(logs.filter((l) => l.entity_type === type && l.entity_id).map((l) => l.entity_id as string))];

  const userIds = idsOfType("user");
  const listingIds = idsOfType("listing");
  const users = new Map<string, string>();
  const listings = new Map<string, string>();

  if (userIds.length) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
    (data ?? []).forEach((u: any) => users.set(u.id, u.email || u.full_name || u.id));
  }
  if (listingIds.length) {
    const { data } = await supabase.from("listings").select("id, title").in("id", listingIds);
    (data ?? []).forEach((l: any) => listings.set(l.id, l.title || l.id));
  }
  return { users, listings };
}

export interface ActivityItem {
  who: string; action: string; target: string; time: string; at: string;
  entityType: string | null; entityId: string | null;
}

// Actividad reciente real: avisos publicados + acciones del staff (auditoría).
export async function fetchRecentActivity(): Promise<{ data: ActivityItem[]; real: boolean }> {
  try {
    const items: ActivityItem[] = [];
    const { data: listings } = await supabase.rpc("admin_list_listings", {
      p_search: null, p_status: null, p_limit: 8, p_offset: 0,
    });
    (listings ?? []).forEach((l: any) => items.push({
      who: l.advertiser ?? "Anunciante", action: "publicó el aviso", target: l.title,
      at: l.created_at, time: relativeTime(l.created_at),
      entityType: "listing", entityId: l.id,
    }));
    const { data: logs } = await supabase
      .from("audit_logs")
      .select("action, entity_type, entity_id, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(8);
    // Mismas etiquetas que "Auditoría y registros": nada de `set_role_permission`
    // ni de IDs crudos en la actividad reciente.
    const names = await resolveEntityNames(logs ?? []);
    (logs ?? []).forEach((a: any) => {
      const type = a.entity_type ?? null;
      const id = a.entity_id ?? null;
      items.push({
        who: a.actor?.email || a.actor?.full_name || "Staff",
        action: auditActionLabel(a.action),
        // Sin ID que resolver, el tipo traducido es lo más informativo que hay.
        target: auditEntityName(type, id, names) || (type ? auditEntityLabel(type) : ""),
        at: a.created_at, time: relativeTime(a.created_at),
        entityType: type, entityId: id,
      });
    });
    if (items.length) {
      items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
      return { data: items.slice(0, 6), real: true };
    }
    if (await isAuthed()) return { data: [], real: true };
  } catch { /* fallback */ }
  return {
    real: false,
    data: mockActivity.map((a) => ({
      who: a.who, action: a.action, target: a.target, time: a.time, at: "",
      entityType: null, entityId: null,
    })),
  };
}

export async function fetchCategoryDistribution() {
  try {
    const { data, error } = await supabase.rpc("admin_category_distribution");
    if (error) throw error;
    if (data?.length) return (data as any[]).map((r) => ({ name: r.name, value: Number(r.value) || 0 }));
  } catch { /* fallback */ }
  return mockCats;
}

export interface ReportDateRange { from?: string | null; to?: string | null }
const rangeArgs = (range?: ReportDateRange) => ({ p_from: range?.from || null, p_to: range?.to || null });

// Avisos + monto por categoría (datos reales; vacío si aún no hay).
export async function fetchCategoryRevenue(range?: ReportDateRange) {
  try {
    const { data, error } = await supabase.rpc("admin_category_revenue", rangeArgs(range));
    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => ({ cat: r.cat, avisos: Number(r.avisos) || 0, monto: Number(r.monto) || 0 }));
  } catch { return []; }
}

// Avisos + monto por región/ciudad (datos reales).
export async function fetchRegionDistribution(range?: ReportDateRange) {
  try {
    const { data, error } = await supabase.rpc("admin_region_distribution", rangeArgs(range));
    if (error) throw error;
    return ((data as any[]) ?? []).map((r) => ({ reg: r.reg, avisos: Number(r.avisos) || 0, monto: Number(r.monto) || 0 }));
  } catch { return []; }
}

export interface ClaimsSummary {
  recibidos: number; pendientes: number; solucionados: number;
  trend: { mes: string; recibidos: number; solucionados: number }[];
}
export async function fetchClaimsSummary(range?: ReportDateRange): Promise<ClaimsSummary> {
  try {
    const { data, error } = await supabase.rpc("admin_claims_summary", rangeArgs(range));
    if (error) throw error;
    const d = data as any;
    return {
      recibidos: Number(d?.recibidos) || 0,
      pendientes: Number(d?.pendientes) || 0,
      solucionados: Number(d?.solucionados) || 0,
      trend: ((d?.trend as any[]) ?? []).map((t) => ({ mes: t.mes, recibidos: Number(t.recibidos) || 0, solucionados: Number(t.solucionados) || 0 })),
    };
  } catch {
    return { recibidos: 0, pendientes: 0, solucionados: 0, trend: [] };
  }
}

// ------------------------------------------------------------------ Usuarios
export interface AdminUser {
  id: string; full_name: string; email: string; status: string; verified: boolean;
  roles: string; listings_count: number; suspended_until: string | null;
  rating: number; created_at: string;
}

export async function fetchAdminUsers(opts?: { search?: string; role?: string }): Promise<{ data: AdminUser[]; real: boolean }> {
  try {
    const { data, error } = await supabase.rpc("admin_list_users", {
      p_search: opts?.search || null, p_role: opts?.role || null, p_limit: 200, p_offset: 0,
    });
    if (error) throw error;
    if (data?.length || (await isAuthed())) return { data: (data ?? []) as AdminUser[], real: true };
  } catch { /* fallback */ }
  // Mapea el mock al mismo tipo para no romper el diseño.
  const mapped: AdminUser[] = mockUsers.map((u) => ({
    id: u.id, full_name: u.name, email: u.email,
    status: u.status === "Activo" ? "active" : u.status === "Suspendido" ? "suspended" : "pending",
    verified: u.status === "Activo", roles: u.role.toLowerCase(),
    listings_count: u.listings, suspended_until: null, rating: 0, created_at: u.date,
  }));
  return { data: mapped, real: false };
}

export async function setUserStatus(userId: string, status: string, reason?: string, until?: string) {
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user: userId, p_status: status, p_reason: reason || null, p_until: until || null,
  });
  if (error) throw error;
}

export async function verifyUser(userId: string, verified: boolean) {
  const { error } = await supabase.rpc("admin_verify_user", { p_user: userId, p_verified: verified });
  if (error) throw error;
}

// Asigna un rol a un usuario (solo superadmin). Roles válidos del enum app_role.
export async function assignUserRole(userId: string, role: string) {
  const { error } = await supabase.rpc("admin_assign_role", { p_user: userId, p_role: role });
  if (error) throw error;
}

// Cambia el rol del usuario de forma EXCLUSIVA (reemplaza todos sus roles).
export async function setUserRole(userId: string, role: string) {
  const { error } = await supabase.rpc("admin_set_user_role", { p_user: userId, p_role: role });
  if (error) throw error;
}

// Otorga créditos a un usuario (solo staff). Valida el rol en el servidor
// (RPC security definer) y registra la transacción + auditoría. Devuelve el saldo nuevo.
export async function grantCredits(userId: string, credits: number, reason?: string): Promise<number> {
  const { data, error } = await supabase.rpc("admin_grant_credits", {
    p_user: userId, p_credits: credits, p_reason: reason ?? null,
  });
  if (error) throw error;
  return Number(data) || 0;
}

// Quita un rol a un usuario (solo superadmin).
export async function removeUserRole(userId: string, role: string) {
  const { error } = await supabase.rpc("admin_remove_role", { p_user: userId, p_role: role });
  if (error) throw error;
}

// Elimina al usuario de forma permanente (solo superadmin; borra auth + cascada).
export async function deleteUser(userId: string) {
  const { error } = await supabase.rpc("admin_delete_user", { p_user: userId });
  if (error) throw error;
}

// ------------------------------------------------------------------ Avisos
export interface AdminListingRow {
  id: string; title: string; category_id: string; status: string; featured: boolean;
  price: number; currency: string; advertiser: string | null; views: number; created_at: string;
  published_at?: string | null; expires_at?: string | null;
}

export async function fetchAdminListings(opts?: { search?: string; status?: string }): Promise<{ data: AdminListingRow[]; real: boolean }> {
  try {
    const { data, error } = await supabase.rpc("admin_list_listings", {
      p_search: opts?.search || null, p_status: opts?.status || null, p_limit: 200, p_offset: 0,
    });
    if (error) throw error;
    if (data?.length || (await isAuthed())) return { data: (data ?? []) as AdminListingRow[], real: true };
  } catch { /* fallback */ }
  const mapped: AdminListingRow[] = mockListings.map((l) => ({
    id: l.id, title: l.title, category_id: l.category,
    status: l.status === "Activo" ? "active" : l.status === "Pendiente" ? "pending"
          : l.status === "Rechazado" ? "rejected" : "active",
    featured: l.status === "Destacado", price: 0, currency: "PEN",
    advertiser: l.advertiser, views: 0, created_at: l.date,
    published_at: null, expires_at: null,
  }));
  return { data: mapped, real: false };
}

export async function setListingStatus(listingId: string, status: string, reason?: string) {
  const { error } = await supabase.rpc("admin_set_listing_status", {
    p_listing: listingId, p_status: status, p_reason: reason ?? null,
  });
  if (error) throw error;
}

// Herramienta de PRUEBA (superadmin): mueve la fecha de publicación/creación
// de un aviso conservando su duración, para testear la caducidad sin esperar.
// La BD recalcula expires_at y reevalúa el estado (active <-> expired).
export async function setListingPublishedAt(listingId: string, publishedAtISO: string) {
  const { error } = await supabase.rpc("admin_set_listing_published", {
    p_listing: listingId, p_published_at: publishedAtISO,
  });
  if (error) throw error;
}

// ------------------------------------------------------------------ Denuncias
export interface AdminReport {
  id: string; target_type: string; reason: string; category: string | null; status: string;
  action_taken: string | null; reporter: string | null; reported: string | null;
  reporter_id: string | null; reported_id: string | null;
  listing_id: string | null; listing_title: string | null;
  assigned_to: string | null; assignee: string | null; created_at: string;
}

// Un mensaje de la conversación entre dos usuarios (vista de moderación).
export interface ModMessage {
  id: string; sender_id: string; sender_name: string | null; body: string;
  status: string; created_at: string; listing_title: string | null;
}

// Trae todos los mensajes intercambiados entre dos usuarios (para moderar una
// denuncia). Solo funciona con sesión de staff (RLS vía RPC security definer).
export async function fetchConversationBetween(a: string | null, b: string | null): Promise<ModMessage[]> {
  if (!a || !b) return [];
  try {
    const { data, error } = await supabase.rpc("admin_conversation_between", { p_a: a, p_b: b });
    if (error) throw error;
    return (data ?? []) as ModMessage[];
  } catch { return []; }
}

export async function fetchReports(): Promise<{ data: AdminReport[]; real: boolean }> {
  try {
    const { data, error } = await supabase.rpc("admin_list_reports");
    if (error) throw error;
    // Con sesión de staff confiamos en el resultado real aunque esté vacío.
    if (data?.length || (await isAuthed())) return { data: (data ?? []) as AdminReport[], real: true };
  } catch { /* fallback */ }
  const mapped: AdminReport[] = mockReports.map((r) => ({
    id: r.id, target_type: "user", reason: r.reason, category: null,
    status: r.status === "Abierto" ? "open" : r.status === "En revisión" ? "reviewing" : "resolved",
    action_taken: null, reporter: r.reporter, reported: r.reported, reporter_id: null, reported_id: null,
    listing_id: null, listing_title: null, assigned_to: null, assignee: null, created_at: r.date,
  }));
  return { data: mapped, real: false };
}

export async function assignReport(reportId: string, moderatorId: string) {
  const { error } = await supabase.rpc("admin_assign_report", { p_report: reportId, p_moderator: moderatorId });
  if (error) throw error;
}

export async function resolveReport(reportId: string, action: "dismiss" | "warn" | "remove" | "ban", note?: string) {
  const { error } = await supabase.rpc("admin_resolve_report", { p_report: reportId, p_action: action, p_note: note || null });
  if (error) throw error;
}

// El aviso denunciado, tal como lo ve el moderador.
export interface AdminListingDetail {
  id: string; title: string; description: string | null; price: number; currency: string;
  condition: string | null; category_id: string | null; subcategory_id: string | null;
  location: string | null; status: string; featured: boolean; urgent: boolean; views: number;
  rejection_reason: string | null; published_at: string | null; created_at: string;
  advertiser: string | null; advertiser_id: string | null; images: string[];
}

/**
 * Trae el aviso completo para moderación (admin_get_listing, 0044). No sirve la
 * vista `listing_cards`: filtra `status = 'active'`, y un aviso denunciado suele
 * estar deshabilitado justo por eso. Devuelve null si no existe o no hay permiso.
 */
export async function fetchAdminListing(listingId: string): Promise<AdminListingDetail | null> {
  const { data, error } = await supabase.rpc("admin_get_listing", { p_id: listingId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { ...row, images: row.images ?? [] } as AdminListingDetail;
}

// ------------------------------------------------------------------ Auditoría
export interface AuditRow { id: string; actor: string; action: string; entity: string; ip: string; time: string }

export { auditActionLabel } from "@/lib/auditLabels";

// "2026-07-09" → instante ISO del inicio/fin de ese día en la zona horaria del
// navegador. created_at es timestamptz, así que "hasta el 9" debe incluir todo
// el día 9 y no cortarse en su medianoche. Devuelve null si la fecha no es válida.
function limiteDiaISO(fecha: string, fin: boolean): string | null {
  const d = new Date(`${fecha}T${fin ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function fetchAuditLogs(range?: ReportDateRange): Promise<{ data: AuditRow[]; real: boolean }> {
  try {
    let query = supabase
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, ip, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name, email)");

    const desde = range?.from ? limiteDiaISO(range.from, false) : null;
    const hasta = range?.to ? limiteDiaISO(range.to, true) : null;
    if (desde) query = query.gte("created_at", desde);
    if (hasta) query = query.lte("created_at", hasta);

    // El tope de 200 se aplica dentro del rango pedido, no sobre todo el historial.
    const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    if (data?.length || (await isAuthed())) {
      const logs = data ?? [];
      const names = await resolveEntityNames(logs);

      const rows: AuditRow[] = logs.map((l: any) => ({
        id: `L-${l.id}`,
        actor: l.actor?.email || l.actor?.full_name || "sistema",
        action: auditActionLabel(l.action),
        entity: auditEntityDescription(l.entity_type ?? null, l.entity_id ?? null, names),
        ip: l.ip || "—",
        time: (l.created_at || "").replace("T", " ").slice(0, 16),
      }));
      return { data: rows, real: true };
    }
  } catch { /* fallback */ }
  return { data: mockAudit, real: false };
}

// ------------------------------------------------------------------ Roles / RBAC
export interface RolePermission {
  role: string; module: string; can_view: boolean; can_edit: boolean; can_approve: boolean; can_delete: boolean;
}

export async function fetchRolePermissions(): Promise<{ data: RolePermission[]; real: boolean }> {
  try {
    const { data, error } = await supabase.rpc("admin_list_permissions");
    if (error) throw error;
    if (data?.length) return { data: data as RolePermission[], real: true };
  } catch { /* fallback */ }
  return { data: [], real: false };
}

export async function fetchRoleCounts(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase.rpc("admin_role_counts");
    if (error) throw error;
    const out: Record<string, number> = {};
    (data as any[])?.forEach((r) => { out[r.role] = Number(r.total) || 0; });
    return out;
  } catch { return {}; }
}

export async function setRolePermission(p: RolePermission) {
  const { error } = await supabase.rpc("set_role_permission", {
    p_role: p.role, p_module: p.module,
    p_view: p.can_view, p_edit: p.can_edit, p_approve: p.can_approve, p_delete: p.can_delete,
  });
  if (error) throw error;
}

export interface MyPermission {
  module: string; can_view: boolean; can_edit: boolean; can_approve: boolean; can_delete: boolean;
}

// Permisos efectivos del usuario actual (agregados de sus roles vía get_my_permissions).
// Se usa para aplicar la matriz de "Roles y permisos": ocultar módulos y gatear acciones.
export async function getMyPermissions(): Promise<Record<string, MyPermission>> {
  try {
    const { data, error } = await supabase.rpc("get_my_permissions");
    if (error) throw error;
    const out: Record<string, MyPermission> = {};
    ((data as MyPermission[]) ?? []).forEach((p) => { out[p.module] = p; });
    return out;
  } catch { return {}; }
}

export async function assignRole(userId: string, role: string) {
  const { error } = await supabase.rpc("admin_assign_role", { p_user: userId, p_role: role });
  if (error) throw error;
}

export async function removeRole(userId: string, role: string) {
  const { error } = await supabase.rpc("admin_remove_role", { p_user: userId, p_role: role });
  if (error) throw error;
}

// ------------------------------------------------------------------ Configuración
export interface SystemSetting { key: string; value: any; label: string | null; updated_at: string }

export async function fetchSettings(): Promise<SystemSetting[]> {
  try {
    const { data, error } = await supabase.rpc("get_settings");
    if (error) throw error;
    return (data as SystemSetting[]) ?? [];
  } catch { return []; }
}

export async function setSetting(key: string, value: any, label?: string) {
  const { error } = await supabase.rpc("set_setting", { p_key: key, p_value: value, p_label: label || null });
  if (error) throw error;
}

// ------------------------------------------------------------------ Comunicaciones
// Centro de mensajes del panel: envíos REALES (in-app + push, y email opcional)
// vía las RPCs security-definer de la migración 0039_admin_communications.

// Nº real de destinatarios de una audiencia ("all" | "anunciante" | "buscador").
export async function fetchAudienceCount(audience: string): Promise<number> {
  const { data, error } = await supabase.rpc("admin_audience_count", { p_audience: audience });
  if (error) throw error;
  return Number(data) || 0;
}

// Envío individual. target = email, nombre o uuid. Devuelve el destinatario
// resuelto, o null si no se encontró a nadie con ese dato.
export async function sendIndividualMessage(
  target: string, title: string, body: string, email: boolean,
): Promise<{ sent: number; recipient: string | null }> {
  const { data, error } = await supabase.rpc("admin_send_message", {
    p_target: target, p_title: title, p_body: body, p_email: email,
  });
  if (error) throw error;
  return (data as { sent: number; recipient: string | null }) ?? { sent: 0, recipient: null };
}

// Envío masivo a una audiencia real. Devuelve el nº de destinatarios alcanzados.
export async function broadcastMessage(
  audience: string, title: string, body: string, email: boolean, copyStaff: boolean,
): Promise<number> {
  const { data, error } = await supabase.rpc("admin_broadcast", {
    p_audience: audience, p_title: title, p_body: body, p_email: email, p_copy_staff: copyStaff,
  });
  if (error) throw error;
  return Number(data) || 0;
}

// Estadísticas reales del Centro de mensajes (tarjeta "Resumen de envíos").
export interface CommRecent { action: string; title: string | null; recipients: number; created_at: string }
export interface CommStats { today: number; total: number; recent: CommRecent[] }

export async function fetchCommStats(): Promise<CommStats> {
  try {
    const { data, error } = await supabase.rpc("admin_comm_stats");
    if (error) throw error;
    const d = (data as CommStats) ?? null;
    if (d) return { today: d.today ?? 0, total: d.total ?? 0, recent: d.recent ?? [] };
  } catch { /* fallback */ }
  return { today: 0, total: 0, recent: [] };
}
