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

export async function fetchGrowthSeries() {
  try {
    const { data, error } = await supabase.rpc("admin_growth_series");
    if (error) throw error;
    if (data?.length) return (data as any[]).map((r) => ({
      mes: r.mes, ingresos: Number(r.ingresos) || 0, usuarios: Number(r.usuarios) || 0,
    }));
  } catch { /* fallback */ }
  return mockSeries;
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
          "id, number, type, email, advertiser_name, amount, detail, issued_at, " +
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
    listingTitle: l.listingTitle,
    amount: l.amount,
  }));
  return { data: local, real: false };
}

// ------------------------------------------------------------------ Categorías
export interface AdminCategory {
  id: string; name: string; icon: string; sort_order: number; active: boolean; count: number;
}

// Categorías reales (tabla categories) + nº de avisos por categoría.
export async function fetchCategories(): Promise<{ data: AdminCategory[]; real: boolean }> {
  try {
    const { data: cats, error } = await supabase
      .from("categories")
      .select("id, name, icon, sort_order, active")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    if (cats && (cats.length || (await isAuthed()))) {
      const { data: ls } = await supabase.from("listings").select("category_id");
      const counts: Record<string, number> = {};
      (ls ?? []).forEach((r: any) => { counts[r.category_id] = (counts[r.category_id] ?? 0) + 1; });
      const rows: AdminCategory[] = (cats as any[]).map((c) => ({
        id: c.id, name: c.name, icon: c.icon, sort_order: c.sort_order, active: c.active,
        count: counts[c.id] ?? 0,
      }));
      return { data: rows, real: true };
    }
  } catch { /* fallback */ }
  // Modo demo (sin sesión): set base de categorías con icono como texto.
  const fallback: AdminCategory[] = [
    { id: "inmuebles", name: "Inmuebles", icon: "Home", sort_order: 0, active: true, count: 0 },
    { id: "vehiculos", name: "Vehículos", icon: "Car", sort_order: 1, active: true, count: 0 },
    { id: "empleos", name: "Empleos", icon: "Briefcase", sort_order: 2, active: true, count: 0 },
    { id: "tecnologia", name: "Tecnología", icon: "Smartphone", sort_order: 3, active: true, count: 0 },
    { id: "productos", name: "Productos", icon: "Package", sort_order: 4, active: true, count: 0 },
    { id: "servicios", name: "Servicios", icon: "Wrench", sort_order: 5, active: true, count: 0 },
  ];
  return { data: fallback, real: false };
}

// Genera un slug/id válido a partir del nombre (sin tildes ni espacios).
export function slugify(name: string): string {
  return name.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function createCategory(input: { name: string; icon: string; sort_order: number }) {
  const id = slugify(input.name);
  if (!id) throw new Error("Nombre de categoría inválido.");
  const { error } = await supabase.from("categories").insert({
    id, name: input.name.trim(), icon: input.icon || "Tag", sort_order: input.sort_order, active: true,
  });
  if (error) throw error;
  return id;
}

export async function updateCategory(id: string, patch: { name?: string; icon?: string; active?: boolean }) {
  const { error } = await supabase.from("categories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
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
    (logs ?? []).forEach((a: any) => items.push({
      who: a.actor?.email || a.actor?.full_name || "Staff",
      action: a.action,
      target: [a.entity_type, a.entity_id].filter(Boolean).join(" "),
      at: a.created_at, time: relativeTime(a.created_at),
      entityType: a.entity_type ?? null, entityId: a.entity_id ?? null,
    }));
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

export async function fetchUserActivity(userId: string) {
  if (!isUuid(userId)) return [];
  try {
    const { data, error } = await supabase.rpc("admin_user_activity", { p_user: userId });
    if (error) throw error;
    return (data as any[]) ?? [];
  } catch { return []; }
}

// ------------------------------------------------------------------ Avisos
export interface AdminListingRow {
  id: string; title: string; category_id: string; status: string; featured: boolean;
  price: number; currency: string; advertiser: string | null; views: number; created_at: string;
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
  }));
  return { data: mapped, real: false };
}

export async function setListingStatus(listingId: string, status: string, reason?: string) {
  const { error } = await supabase.rpc("admin_set_listing_status", {
    p_listing: listingId, p_status: status, p_reason: reason ?? null,
  });
  if (error) throw error;
}

export async function toggleFeatured(listingId: string, featured: boolean) {
  const { error } = await supabase.rpc("admin_toggle_featured", { p_listing: listingId, p_featured: featured });
  if (error) throw error;
}

// ------------------------------------------------------------------ Denuncias
export interface AdminReport {
  id: string; target_type: string; reason: string; category: string | null; status: string;
  action_taken: string | null; reporter: string | null; reported: string | null;
  reported_id: string | null; listing_id: string | null; listing_title: string | null;
  assigned_to: string | null; assignee: string | null; created_at: string;
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
    action_taken: null, reporter: r.reporter, reported: r.reported, reported_id: null,
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

// ------------------------------------------------------------------ Auditoría
export interface AuditRow { id: string; actor: string; action: string; entity: string; ip: string; time: string }

// Traducción de las acciones técnicas (audit_logs.action) a lenguaje claro.
const AUDIT_ACTION_LABELS: Record<string, string> = {
  delete_user: "Eliminó usuario",
  set_user_status: "Cambió estado del usuario",
  verify_user: "Verificó usuario",
  reset_password: "Restableció contraseña",
  set_user_role: "Cambió rol del usuario",
  assign_role: "Asignó rol",
  remove_role: "Quitó rol",
  set_role_permission: "Cambió permisos del rol",
  set_listing_status: "Cambió estado del aviso",
  toggle_featured: "Cambió aviso destacado",
  assign_report: "Asignó reporte",
  resolve_report: "Resolvió reporte",
  set_setting: "Cambió configuración",
};

// Traducción del tipo de entidad afectada.
const AUDIT_ENTITY_LABELS: Record<string, string> = {
  user: "Usuario",
  listing: "Aviso",
  report: "Reporte",
  role: "Rol",
  setting: "Configuración",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export async function fetchAuditLogs(): Promise<{ data: AuditRow[]; real: boolean }> {
  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, ip, created_at, actor:profiles!audit_logs_actor_id_fkey(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (data?.length || (await isAuthed())) {
      const logs = data ?? [];

      // Resuelve los IDs a nombres legibles: usuarios → correo, avisos → título.
      const userIds = [...new Set(logs.filter((l: any) => l.entity_type === "user" && l.entity_id).map((l: any) => l.entity_id))];
      const listingIds = [...new Set(logs.filter((l: any) => l.entity_type === "listing" && l.entity_id).map((l: any) => l.entity_id))];

      const userMap = new Map<string, string>();
      const listingMap = new Map<string, string>();
      if (userIds.length) {
        const { data: us } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);
        (us ?? []).forEach((u: any) => userMap.set(u.id, u.email || u.full_name || u.id));
      }
      if (listingIds.length) {
        const { data: ls } = await supabase.from("listings").select("id, title").in("id", listingIds);
        (ls ?? []).forEach((l: any) => listingMap.set(l.id, l.title || l.id));
      }

      const friendlyEntity = (type: string, id: string | null): string => {
        const label = AUDIT_ENTITY_LABELS[type] ?? type ?? "—";
        if (!id) return label;
        let name = id;
        if (type === "user") name = userMap.get(id) ?? id.slice(0, 8);
        else if (type === "listing") name = listingMap.get(id) ?? id.slice(0, 8);
        else if (type === "report") name = id.slice(0, 8);
        return `${label}: ${name}`;
      };

      const rows: AuditRow[] = logs.map((l: any) => ({
        id: `L-${l.id}`,
        actor: l.actor?.email || l.actor?.full_name || "sistema",
        action: auditActionLabel(l.action),
        entity: friendlyEntity(l.entity_type, l.entity_id),
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
