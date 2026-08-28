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
import { compressImage } from "@/lib/compressImage";
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
// Los campos `*_prev` traen el valor que cada cifra tenía hace `window_days`
// (migración 0097). Son lo que permite calcular la variación de las tarjetas:
// antes eran porcentajes escritos a mano que nunca cambiaban.
export interface AdminStats {
  users: number; active_listings: number; pending_listings: number;
  sold_listings: number; total_listings: number; reports_open: number; revenue: number;
  window_days?: number;
  users_prev?: number; active_listings_prev?: number;
  sold_listings_prev?: number; reports_open_prev?: number; revenue_prev?: number;
}

// Ventana de comparación por defecto, por si la RPC es anterior a la 0097.
export const STATS_WINDOW_DAYS = 30;

/**
 * Variación porcentual entre el valor de ahora y el de hace 30 días.
 *
 * Devuelve `null` cuando el porcentaje no significaría nada:
 *  - no había nada antes y ahora sí → no es "+∞%", es algo nuevo;
 *  - no había nada antes ni ahora   → no hay variación que enseñar;
 *  - falta el dato previo (RPC vieja) → mejor nada que un número inventado.
 */
export function variacionPct(actual: number, previo: number | null | undefined): number | null {
  if (previo === null || previo === undefined || !Number.isFinite(previo)) return null;
  if (!Number.isFinite(actual)) return null;
  if (previo === 0) return null;
  return Math.round(((actual - previo) / previo) * 1000) / 10;
}

/**
 * Cómo se escribe esa variación en una tarjeta que mide unos 150px.
 *
 * En una plataforma joven las variaciones son enormes (17 usuarios → 105 son
 * +517%), y un "+1350%" no cabe y encima se lee peor que "×14,5". Por eso el
 * decimal solo se conserva donde aporta, y a partir de multiplicar por diez se
 * cambia a multiplicador.
 */
export function formatVariacion(pct: number): string {
  const abs = Math.abs(pct);
  if (abs >= 1000) return `×${(1 + pct / 100).toFixed(1)}`;
  const n = abs >= 100 ? Math.round(pct) : pct;
  return `${n > 0 ? "+" : ""}${n}%`;
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
        // Sin datos previos no se enseña variación: con 0 y 0 no hay nada que
        // comparar, y `variacionPct` devuelve null.
        window_days: STATS_WINDOW_DAYS,
        users_prev: 0, active_listings_prev: 0, sold_listings_prev: 0,
        reports_open_prev: 0, revenue_prev: 0,
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
      window_days: STATS_WINDOW_DAYS,
      users_prev: adminKpis.usersPrev, active_listings_prev: adminKpis.activeListingsPrev,
      sold_listings_prev: 0, reports_open_prev: adminKpis.reportsOpenPrev,
      revenue_prev: adminKpis.revenuePrev,
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

// ------------------------------------------------------------------ Filas de la BD
// Lo que devuelven los RPC y las consultas, escrito. Antes iba como `any`, que
// además de apagar el comprobador no dejaba por escrito qué trae cada consulta.
interface FilaActor { full_name?: string | null; email?: string | null }
// PostgREST devuelve las relaciones como objeto o como array según la
// cardinalidad, y con `any` esto pasaba desapercibido: `a.actor?.email` sobre un
// array es `undefined`, así que el nombre del staff se habría perdido en
// silencio. Igual que ya se hace más abajo con las relaciones de los pedidos.
const actorDe = (a: { actor?: FilaActor | FilaActor[] | null }): FilaActor =>
  (Array.isArray(a.actor) ? a.actor[0] : a.actor) ?? {};
interface FilaAuditoria {
  id?: string | number; action: string; entity_type?: string | null; entity_id?: string | null;
  created_at?: string | null; ip?: string | null; actor?: FilaActor | FilaActor[] | null;
}

export async function fetchGrowthSeries(range: GrowthRange = "6m"): Promise<GrowthPoint[]> {
  try {
    const { data, error } = await supabase.rpc("admin_growth_series", { p_range: range });
    if (error) throw error;
    if (data?.length) return (data as Array<{ mes: string; ingresos: number; usuarios: number; avisos: number; postulaciones: number }>).map((r) => ({
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
  /** La cuenta ya no existe: el movimiento se conserva, el usuario no. */
  deleted: boolean;
  /**
   * `refund` existe desde la 0101 y NO es un gasto: es saldo que sale sin
   * haberse consumido (una anulacion de comprobante, o un retiro hecho por un
   * administrador). Se creo como tipo aparte justamente para que no se sumara
   * a lo "gastado" por el usuario, y el reporte lo pintaba como "Gasto" igual.
   */
  type: "purchase" | "spend" | "refund";
  credits: number;
  description: string | null;
  listing_title: string | null;
  /**
   * Por dónde entró el dinero, ya en el idioma del reporte ("Tarjeta", "Yape",
   * "QR/Plin"). Un GASTO no tiene forma de pago —se paga con el saldo ya
   * cargado— y viaja como "Saldo"; una COMPRA sin dato es un hueco real del
   * historial y se marca aparte, porque enseñar lo mismo en los dos casos
   * escondería justo lo que habria que mirar.
   */
  metodo: string;
  /** true si es una compra de la que NO se sabe por dónde entró (dato antiguo). */
  metodoDesconocido: boolean;
  created_at: string;
}

/**
 * Cómo se llama cada forma de pago en el reporte.
 *
 * Los nombres coinciden con los que ve el comprador al pagar (ver
 * `NOMBRE_MEDIO` en pagoManual.ts): si el administrador lee "plin" y el usuario
 * pagó por lo que la pantalla llama "QR/Plin", cuadrar es más difícil de lo que
 * hace falta.
 */
const NOMBRE_PROVEEDOR: Record<string, string> = {
  izipay: "Tarjeta",
  yape: "Yape",
  plin: "QR/Plin",
  creditos: "Otorgado por admin",
  backfill: "Dato migrado",
  simulado: "Prueba",
};

/** Como se llama cada tipo de movimiento en el reporte. */
export function nombreDeTipo(tipo: "purchase" | "spend" | "refund"): string {
  if (tipo === "purchase") return "Compra";
  if (tipo === "refund") return "Devolucion";
  return "Gasto";
}

/** Traduce el proveedor de la orden al texto del reporte. */
export function metodoDePago(
  provider: string | null | undefined,
  tipo: "purchase" | "spend" | "refund",
): { metodo: string; desconocido: boolean } {
  // Un gasto es publicar o renovar: sale del saldo, no de una tarjeta.
  if (tipo === "spend") return { metodo: "Saldo", desconocido: false };
  // Una devolucion tampoco tiene forma de pago: es saldo que se retira.
  // Marcarla como "sin registrar" la haria parecer un hueco del historial.
  if (tipo === "refund") return { metodo: "Devolucion", desconocido: false };
  const p = (provider ?? "").trim().toLowerCase();
  if (!p) return { metodo: "Sin registrar", desconocido: true };
  return { metodo: NOMBRE_PROVEEDOR[p] ?? p, desconocido: false };
}

// Tamaño de página del historial de transacciones (paginación en el servidor).
export const CREDIT_TX_PAGE_SIZE = 20;

export interface SaldoUsuario {
  user_id: string;
  full_name: string;
  email: string;
  doc_type: string | null;
  doc_number: string | null;
  balance: number;
}

export const SALDOS_PAGE_SIZE = 20;

/**
 * Reporte de saldos a favor: quién tiene dinero cargado sin gastar.
 *
 * Es la deuda viva de la plataforma con sus usuarios. El historial de
 * transacciones cuenta los movimientos; esto cuenta lo que queda.
 */
export async function fetchSaldosUsuarios(opts: {
  search?: string; soloConSaldo?: boolean; page?: number; pageSize?: number;
} = {}): Promise<{ data: SaldoUsuario[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? SALDOS_PAGE_SIZE;
  try {
    const { data, error } = await supabase.rpc("admin_saldos_usuarios", {
      p_search: opts.search || null,
      p_solo_con_saldo: opts.soloConSaldo ?? true,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      user_id: string; full_name: string | null; email: string | null;
      doc_type: string | null; doc_number: string | null;
      balance: number; total_count: number;
    }>;
    const total = rows.length ? Number(rows[0].total_count) || 0 : 0;
    return {
      data: rows.map((r): SaldoUsuario => ({
        user_id: r.user_id,
        // Una cuenta borrada no borra su saldo: el dinero sigue siendo suyo.
        full_name: r.full_name ?? "Usuario eliminado",
        email: r.email ?? `id ${r.user_id.slice(0, 8)}`,
        doc_type: r.doc_type,
        doc_number: r.doc_number,
        balance: Number(r.balance) || 0,
      })),
      total,
    };
  } catch {
    return { data: [], total: 0 };
  }
}

// EFFE-054: historial de transacciones de crédito de TODOS los usuarios, con
// búsqueda por usuario/correo, filtro de fechas y paginación. El RPC exige el
// permiso 'Reportes'/'edit' (ver permissions.ts); sin ese permiso devuelve vacío.
export async function fetchAdminCreditTransactions(opts: {
  search?: string; type?: "purchase" | "spend"; from?: string; to?: string; page?: number;
  /** Filas a traer. Solo la exportación lo sube: la pantalla usa el tamaño de página. */
  pageSize?: number;
}): Promise<{ data: AdminCreditTx[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? CREDIT_TX_PAGE_SIZE);
  try {
    const { data, error } = await supabase.rpc("admin_credit_transactions", {
      p_search: opts.search || null,
      p_type: opts.type || null,
      p_from: opts.from || null,
      p_to: opts.to || null,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });
    if (error) throw error;
    // `total_count` viaja en cada fila (el RPC pagina en el servidor).
    const rows = (data ?? []) as Array<{
      id: string; user_id: string; full_name: string | null; email: string | null;
      type: "purchase" | "spend" | "refund"; credits: number; description: string | null;
      listing_title: string | null; payment_provider: string | null;
      created_at: string; total_count: number;
    }>;
    const total = rows.length ? Number(rows[0].total_count) || 0 : 0;
    return {
      data: rows.map((r): AdminCreditTx => ({
        id: r.id,
        user_id: r.user_id,
        // Si la cuenta se borró, el movimiento sigue en el historial (es un
        // registro financiero): se identifica por el inicio de su id, que es
        // lo único que queda para rastrearlo — y por él se puede buscar.
        full_name: r.full_name ?? "Usuario eliminado",
        email: r.email ?? `id ${r.user_id.slice(0, 8)}`,
        deleted: !r.full_name && !r.email,
        type: r.type,
        credits: Number(r.credits) || 0,
        description: r.description ?? null,
        listing_title: r.listing_title ?? null,
        ...(() => {
          const m = metodoDePago(r.payment_provider, r.type);
          return { metodo: m.metodo, metodoDesconocido: m.desconocido };
        })(),
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
  // Estado de la emisión electrónica. Sin esto el panel no podía decir si un
  // comprobante había fallado, y la función de reintentarlo —que existe desde
  // la 0083— no la llamaba nadie.
  sunatStatus: string;
  emailStatus: string;
  needsReview: boolean;
  sunatError: string | null;
  sunatAttempts: number;
  esPrueba: boolean;
  /** Si está anulado: cuándo, por qué y con qué nota de crédito. */
  anuladoAt: string | null;
  anuladoMotivo: string | null;
  notaNumber: string | null;
  notaStatus: string | null;
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
  sunat_status?: string | null;
  email_status?: string | null;
  needs_review?: boolean | null;
  sunat_last_error?: string | null;
  sunat_attempts?: number | null;
  es_prueba?: boolean | null;
  anulado_at?: string | null;
  anulado_motivo?: string | null;
  nota_number?: string | null;
  nota_sunat_status?: string | null;
  orders?: RelOrder | RelOrder[] | null;
}

export interface FiltroComprobantes {
  /** Número, anunciante, documento, correo o concepto. */
  search?: string;
  tipo?: "boleta" | "factura";
  sunat?: string;
  /** Fechas en formato YYYY-MM-DD. */
  desde?: string;
  hasta?: string;
  soloAnulados?: boolean;
  /** Solo los que se quedaron a medias y hay que atender a mano. */
  soloAtencion?: boolean;
  page?: number;
  pageSize?: number;
}

export const INVOICES_PAGE_SIZE = 20;

/**
 * Qué es un comprobante "que necesita atención".
 *
 * Vive en UNA constante a propósito: la usan el contador del panel y el filtro
 * de la lista, y si cada uno decidiera por su cuenta acabarían discrepando —el
 * aviso diría "3" y al pulsarlo saldrían 5, que es la forma más rápida de que
 * nadie vuelva a hacer caso al aviso.
 *
 * Un anulado no cuenta aunque su emisión fuera mal: ya se resolvió por otra vía
 * y no hay nada que reintentar.
 */
const ATENCION_SUNAT = ["rechazado", "error", "vencido"];
const FILTRO_ATENCION =
  `sunat_status.in.(${ATENCION_SUNAT.join(",")}),email_status.eq.error,needs_review.eq.true`;

/**
 * Cuántos comprobantes se quedaron a medias.
 *
 * El panel comercial ya enseñaba el estado de cada uno y hasta ofrecía
 * reintentarlo, pero paginado de 20 en 20: un rechazo de hace tres semanas está
 * en la página 4 y nadie lo ve. Una boleta que SUNAT rechazó y nadie mira es un
 * problema tributario esperando a que el cliente reclame.
 *
 * Ante cualquier error devuelve 0: es un aviso, y un aviso que revienta la
 * pantalla de inicio del administrador sería peor que no tenerlo.
 */
export async function contarComprobantesConProblema(): Promise<number> {
  try {
    if (!(await isAuthed())) return 0;
    const { count, error } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .is("anulado_at", null)
      .or(FILTRO_ATENCION);
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Comprobantes del panel.
 *
 * Antes traía TODOS sin límite y se paginaba en el navegador: con 89 boletas ya
 * era lento y con unos miles no cargaría. Ahora filtra y pagina en el servidor.
 * No hace falta RPC: la RLS de `invoices` ya decide quién ve qué.
 */
export async function fetchAllInvoices(
  filtro: FiltroComprobantes = {},
): Promise<{ data: AdminInvoice[]; real: boolean; total: number }> {
  const page = Math.max(1, filtro.page ?? 1);
  const pageSize = filtro.pageSize ?? INVOICES_PAGE_SIZE;
  try {
    if (await isAuthed()) {
      let consulta = supabase
        .from("invoices")
        .select(
          "id, number, type, email, advertiser_name, doc_type, doc_number, factiliza_data, amount, detail, issued_at, " +
            "sunat_status, email_status, needs_review, sunat_last_error, sunat_attempts, es_prueba, " +
            "anulado_at, anulado_motivo, nota_number, nota_sunat_status, " +
            "orders ( order_listings ( listings ( title ) ) )",
          { count: "exact" },
        );

      const q = (filtro.search ?? "").trim();
      if (q) {
        // El título del aviso no entra aquí: filtrar por una relación anidada no
        // se puede en un `or`. Se busca por lo que identifica al comprobante.
        const like = `%${q.replace(/[%,()]/g, " ")}%`;
        consulta = consulta.or(
          `number.ilike.${like},advertiser_name.ilike.${like},doc_number.ilike.${like},` +
          `email.ilike.${like},detail.ilike.${like}`,
        );
      }
      if (filtro.tipo) consulta = consulta.eq("type", filtro.tipo);
      if (filtro.sunat) consulta = consulta.eq("sunat_status", filtro.sunat);
      // Misma condición que el contador del panel: ver arriba por qué comparten
      // constante en vez de repetirse.
      if (filtro.soloAtencion) consulta = consulta.is("anulado_at", null).or(FILTRO_ATENCION);
      if (filtro.desde) consulta = consulta.gte("issued_at", filtro.desde);
      // `hasta` es un día entero: sin el +1 se perderían los del mismo día.
      if (filtro.hasta) consulta = consulta.lt("issued_at", `${filtro.hasta}T23:59:59.999Z`);
      if (filtro.soloAnulados) consulta = consulta.not("anulado_at", "is", null);

      const desde = (page - 1) * pageSize;
      const { data, error, count } = await consulta
        .order("issued_at", { ascending: false })
        .range(desde, desde + pageSize - 1);
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
          sunatStatus: r.sunat_status ?? "omitido",
          emailStatus: r.email_status ?? "pendiente",
          needsReview: r.needs_review === true,
          sunatError: r.sunat_last_error ?? null,
          sunatAttempts: Number(r.sunat_attempts ?? 0),
          esPrueba: r.es_prueba === true,
          anuladoAt: r.anulado_at ?? null,
          anuladoMotivo: r.anulado_motivo ?? null,
          notaNumber: r.nota_number ?? null,
          notaStatus: r.nota_sunat_status ?? null,
        };
      });
      return { data: rows, real: true, total: count ?? rows.length };
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
    sunatStatus: "omitido",
    emailStatus: "omitido",
    needsReview: false,
    sunatError: null,
    sunatAttempts: 0,
    esPrueba: false,
    anuladoAt: null,
    anuladoMotivo: null,
    notaNumber: null,
    notaStatus: null,
  }));
  return { data: local, real: false, total: local.length };
}

/**
 * Vuelve a poner un comprobante en cola de emisión y de correo.
 *
 * La RPC existe desde la migración 0083 y hasta ahora no la llamaba nadie: un
 * comprobante que fallara solo se podía rescatar entrando a la base de datos a
 * mano. Exige permiso de edición en «Pagos y planes», que lo comprueba la
 * propia función en el servidor.
 */
export async function retryInvoiceEmission(invoiceId: string): Promise<void> {
  const { error } = await supabase.rpc("retry_invoice_emission", { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------- Anular un comprobante
/** Lo que pasaría al anular. Se enseña ANTES de confirmar. */
export interface PrevisualizacionAnulacion {
  number: string;
  yaAnulado: boolean;
  /** Está declarado ante SUNAT, así que se emitirá una nota de crédito. */
  emitiraNota: boolean;
  esPrueba: boolean;
  /** Créditos que se acreditaron por esa compra. */
  creditosCompra: number;
  saldoActual: number;
  seRetirara: number;
  /** Lo que el usuario ya gastó y no se puede recuperar. */
  sinRecuperar: number;
  saldoSuficiente: boolean;
}

/**
 * Pregunta qué ocurriría al anular, sin anular nada.
 *
 * Existe porque anular retira saldo y emite un documento fiscal: quien lo hace
 * tiene que ver los números concretos —cuánto se devuelve, cuánto se puede
 * retirar de verdad, cuánto se queda por el camino— en vez de un «¿seguro?».
 */
export async function previsualizarAnulacion(invoiceId: string): Promise<PrevisualizacionAnulacion> {
  const { data, error } = await supabase.rpc("previsualizar_anulacion", { p_invoice_id: invoiceId });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    number: String(r.number ?? ""),
    yaAnulado: r.ya_anulado === true,
    emitiraNota: r.emitira_nota === true,
    esPrueba: r.es_prueba === true,
    creditosCompra: Number(r.creditos_compra ?? 0),
    saldoActual: Number(r.saldo_actual ?? 0),
    seRetirara: Number(r.se_retirara ?? 0),
    sinRecuperar: Number(r.sin_recuperar ?? 0),
    saldoSuficiente: r.saldo_suficiente === true,
  };
}

/**
 * Anula la compra: retira el saldo y, si el comprobante estaba declarado, deja
 * la nota de crédito en cola para SUNAT.
 *
 * `aceptarSinSaldo` es el visto bueno explícito cuando el usuario ya gastó parte
 * de lo comprado. Sin él, el servidor se niega.
 *
 * OJO: el dinero del cobro NO se devuelve aquí. Eso se hace en el panel de
 * Izipay, a mano.
 */
export async function anularComprobante(
  invoiceId: string,
  motivo: string,
  aceptarSinSaldo = false,
): Promise<{ anulado: boolean; nota: string | null; creditosRetirados: number; motivo?: string }> {
  const { data, error } = await supabase.rpc("anular_comprobante", {
    p_invoice_id: invoiceId,
    p_motivo: motivo,
    p_aceptar_sin_saldo: aceptarSinSaldo,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    anulado: r.anulado === true,
    nota: (r.nota as string | null) ?? null,
    creditosRetirados: Number(r.creditos_retirados ?? 0),
    motivo: r.motivo as string | undefined,
  };
}

// ------------------------------------------------------------------ Categorías
export interface AdminCategory {
  id: string; name: string; icon: string; sort_order: number; active: boolean;
  // Si es false, el formulario de publicar oculta el campo "Condición".
  condition_enabled: boolean;
  // Foto de portada. null = la portada usa una de reserva (CATEGORY_PHOTO_POOL).
  image_url: string | null;
  count: number;
}

const CATEGORY_BUCKET = "category-images";
const CATEGORY_PUBLIC_SEG = `/storage/v1/object/public/${CATEGORY_BUCKET}/`;

/** Ruta dentro del bucket a partir de la URL pública; null si no es nuestra. */
function categoryImagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(CATEGORY_PUBLIC_SEG);
  if (i < 0) return null; // seeds de Unsplash u otra URL externa
  return decodeURIComponent(url.slice(i + CATEGORY_PUBLIC_SEG.length).split("?")[0]);
}

// Categorías reales (tabla categories) + nº de avisos por categoría.
export async function fetchCategories(): Promise<{ data: AdminCategory[]; real: boolean }> {
  try {
    const { data: cats, error } = await supabase
      .from("categories")
      .select("id, name, icon, sort_order, active, condition_enabled, image_url")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    if (cats && (cats.length || (await isAuthed()))) {
      const { data: ls } = await supabase.from("listings").select("category_id");
      const counts: Record<string, number> = {};
      (ls ?? []).forEach((r: { category_id: string }) => { counts[r.category_id] = (counts[r.category_id] ?? 0) + 1; });
      const rows: AdminCategory[] = (cats as Array<{
        id: string; name: string; icon: string; sort_order: number; active: boolean;
        condition_enabled?: boolean | null; image_url?: string | null;
      }>).map((c) => ({
        id: c.id, name: c.name, icon: c.icon, sort_order: c.sort_order, active: c.active,
        condition_enabled: c.condition_enabled !== false,
        image_url: c.image_url ?? null,
        count: counts[c.id] ?? 0,
      }));
      return { data: rows, real: true };
    }
  } catch { /* fallback */ }
  // Modo demo (sin sesión): set base de categorías con icono como texto.
  const fallback: AdminCategory[] = [
    { id: "inmuebles", name: "Inmuebles", icon: "Home", sort_order: 0, active: true, condition_enabled: true, image_url: null, count: 0 },
    { id: "vehiculos", name: "Vehículos", icon: "Car", sort_order: 1, active: true, condition_enabled: true, image_url: null, count: 0 },
    { id: "empleos", name: "Empleos", icon: "Briefcase", sort_order: 2, active: true, condition_enabled: false, image_url: null, count: 0 },
    { id: "tecnologia", name: "Tecnología", icon: "Smartphone", sort_order: 3, active: true, condition_enabled: true, image_url: null, count: 0 },
    { id: "productos", name: "Productos", icon: "Package", sort_order: 4, active: true, condition_enabled: true, image_url: null, count: 0 },
    { id: "servicios", name: "Servicios", icon: "Wrench", sort_order: 5, active: true, condition_enabled: false, image_url: null, count: 0 },
  ];
  return { data: fallback, real: false };
}

// Genera un slug/id válido a partir del nombre (sin tildes ni espacios).
export function slugify(name: string): string {
  return name.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function createCategory(input: { name: string; icon: string; sort_order: number; condition_enabled?: boolean; image_url?: string | null }) {
  const id = slugify(input.name);
  if (!id) throw new Error("Nombre de categoría inválido.");
  const { error } = await supabase.from("categories").insert({
    id, name: input.name.trim(), icon: input.icon || "Tag", sort_order: input.sort_order, active: true,
    condition_enabled: input.condition_enabled ?? true,
    image_url: input.image_url ?? null,
  });
  if (error) throw error;
  return id;
}

export async function updateCategory(id: string, patch: { name?: string; icon?: string; active?: boolean; condition_enabled?: boolean; image_url?: string | null }) {
  const { error } = await supabase.from("categories").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Sube la foto de portada de una categoría al bucket público `category-images`
 * y devuelve su URL pública. La RLS (0077) deja escribir a quien tenga
 * 'Configuración comercial' · Editar, el mismo permiso que rige la tabla.
 *
 * El nombre lleva timestamp, como `replaceMainListingPhoto`: con un nombre fijo
 * el CDN seguiría sirviendo la foto anterior hasta 30 días, y el truco del `?t=`
 * no vale aquí porque la URL se reescribe luego a /render/image/ y quedaría con
 * dos `?`. La imagen anterior se borra en cuanto la nueva está arriba.
 */
export async function uploadCategoryImage(
  categoryId: string, file: File, previousUrl?: string | null,
): Promise<string> {
  const compressed = await compressImage(file); // WebP, lado mayor 1600px
  const ext = (compressed.type.split("/")[1] || "webp").replace(/[^a-z0-9]/g, "") || "webp";
  const path = `${categoryId}/cover-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(CATEGORY_BUCKET).upload(path, compressed, {
    upsert: true, cacheControl: "2592000", contentType: compressed.type || undefined,
  });
  if (error) throw error;

  const old = categoryImagePath(previousUrl);
  if (old && old !== path) {
    try { await supabase.storage.from(CATEGORY_BUCKET).remove([old]); } catch { /* un huérfano no rompe nada */ }
  }

  const { data: pub } = supabase.storage.from(CATEGORY_BUCKET).getPublicUrl(path);
  return pub.publicUrl; // sin `?t=`: el nombre ya es único
}

// ------------------------------------------------------------------ Imagen por defecto de los avisos
const SITE_BUCKET = "site-assets";
const SITE_PUBLIC_SEG = `/storage/v1/object/public/${SITE_BUCKET}/`;

function siteAssetPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(SITE_PUBLIC_SEG);
  return i === -1 ? null : decodeURIComponent(url.slice(i + SITE_PUBLIC_SEG.length).split("?")[0]);
}

/**
 * Sube la imagen que verán los avisos sin foto y devuelve su URL pública.
 *
 * Mismo procedimiento que la imagen de categoría: se comprime a WebP, el nombre
 * lleva la marca de tiempo (con nombre fijo el CDN seguiría sirviendo la vieja
 * hasta 30 días) y se borra la anterior para no dejar basura en el bucket.
 */
export async function uploadDefaultListingImage(file: File, previousUrl?: string | null): Promise<string> {
  const compressed = await compressImage(file);
  const ext = (compressed.type.split("/")[1] || "webp").replace(/[^a-z0-9]/g, "") || "webp";
  const path = `aviso-sin-imagen/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(SITE_BUCKET).upload(path, compressed, {
    upsert: true, cacheControl: "2592000", contentType: compressed.type || undefined,
  });
  if (error) throw error;

  const old = siteAssetPath(previousUrl);
  if (old && old !== path) {
    try { await supabase.storage.from(SITE_BUCKET).remove([old]); } catch { /* un huérfano no rompe nada */ }
  }

  const { data: pub } = supabase.storage.from(SITE_BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

/** Borra del bucket la imagen por defecto al quitarla desde el panel. */
export async function removeDefaultListingImage(url: string | null | undefined): Promise<void> {
  const path = siteAssetPath(url);
  if (!path) return;
  try { await supabase.storage.from(SITE_BUCKET).remove([path]); } catch { /* idem */ }
}

// ------------------------------------------------------------------ QR de cobro (Yape / QR-Plin)
export const QR_PAGO_TIPOS = ["image/png", "image/jpeg", "image/webp"];
const QR_PAGO_MAX_BYTES = 2 * 1024 * 1024;

/** Por qué no sirve este archivo como QR, o null si sirve. */
export function motivoQrInvalido(file: File): string | null {
  if (!QR_PAGO_TIPOS.includes(file.type)) return "El QR tiene que ser una imagen PNG, JPG o WEBP.";
  if (file.size > QR_PAGO_MAX_BYTES) return "La imagen del QR no puede pasar de 2 MB.";
  return null;
}

/**
 * Sube el QR de cobro y devuelve su URL pública.
 *
 * A diferencia de las otras imágenes del sitio, esta NO pasa por
 * `compressImage`: un QR es un patrón de píxeles que se lee con la cámara, y
 * recodificarlo con pérdida es justo lo que puede volverlo ilegible en una
 * pantalla pequeña. Son unos pocos KB, así que sube tal cual.
 */
export async function subirQrDePago(file: File, previousUrl?: string | null): Promise<string> {
  const motivo = motivoQrInvalido(file);
  if (motivo) throw new Error(motivo);

  const ext = (file.type.split("/")[1] || "png").replace(/[^a-z0-9]/g, "") || "png";
  // Nombre con marca de tiempo, como las demás: con nombre fijo el CDN seguiría
  // sirviendo el QR anterior durante días, y aquí eso son pagos a otra cuenta.
  const path = `qr-pagos/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(SITE_BUCKET).upload(path, file, {
    upsert: true, cacheControl: "2592000", contentType: file.type || undefined,
  });
  if (error) throw error;

  const old = siteAssetPath(previousUrl);
  if (old && old !== path) {
    try { await supabase.storage.from(SITE_BUCKET).remove([old]); } catch { /* un huérfano no rompe nada */ }
  }

  const { data: pub } = supabase.storage.from(SITE_BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

/** Borra el QR del bucket al quitarlo desde el panel. */
export async function borrarQrDePago(url: string | null | undefined): Promise<void> {
  const path = siteAssetPath(url);
  if (!path) return;
  try { await supabase.storage.from(SITE_BUCKET).remove([path]); } catch { /* idem */ }
}

export async function deleteCategory(id: string) {
  // Las fotos de la categoría se van con ella; si falla, manda el borrado.
  try {
    const { data } = await supabase.storage.from(CATEGORY_BUCKET).list(id);
    if (data?.length) await supabase.storage.from(CATEGORY_BUCKET).remove(data.map((o) => `${id}/${o.name}`));
  } catch { /* huérfanos tolerables */ }
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
    (data ?? []).forEach((u: { id: string; email?: string | null; full_name?: string | null }) =>
      users.set(u.id, u.email || u.full_name || u.id));
  }
  if (listingIds.length) {
    const { data } = await supabase.from("listings").select("id, title").in("id", listingIds);
    (data ?? []).forEach((l: { id: string; title?: string | null }) => listings.set(l.id, l.title || l.id));
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
    (listings ?? []).forEach((l: { id: string; title: string; advertiser?: string | null; created_at: string }) => items.push({
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
    (logs ?? []).forEach((a: FilaAuditoria) => {
      const type = a.entity_type ?? null;
      const id = a.entity_id ?? null;
      items.push({
        who: actorDe(a).email || actorDe(a).full_name || "Staff",
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
    if (data?.length) return (data as Array<{ name: string; value: number }>).map((r) => ({ name: r.name, value: Number(r.value) || 0 }));
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
    return ((data as Array<{ cat: string; avisos: number; renovaciones: number; monto: number }>) ?? [])
      .map((r) => ({
        cat: r.cat,
        avisos: Number(r.avisos) || 0,
        // Las renovaciones van APARTE de los avisos: el monto ya las incluía
        // pero el conteo no, y las dos columnas se leían como si contaran lo
        // mismo. Un aviso renovado cinco veces sigue siendo un aviso.
        renovaciones: Number(r.renovaciones) || 0,
        monto: Number(r.monto) || 0,
      }));
  } catch { return []; }
}

// Avisos + monto por región/ciudad (datos reales).
export async function fetchRegionDistribution(range?: ReportDateRange) {
  try {
    const { data, error } = await supabase.rpc("admin_region_distribution", rangeArgs(range));
    if (error) throw error;
    return ((data as Array<{ reg: string; avisos: number; renovaciones: number; monto: number }>) ?? [])
      .map((r) => ({
        reg: r.reg,
        avisos: Number(r.avisos) || 0,
        renovaciones: Number(r.renovaciones) || 0,
        monto: Number(r.monto) || 0,
      }));
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
    const d = data as { recibidos?: number; pendientes?: number; solucionados?: number; trend?: Array<{ mes: string; recibidos: number; solucionados: number }> } | null;
    return {
      recibidos: Number(d?.recibidos) || 0,
      pendientes: Number(d?.pendientes) || 0,
      solucionados: Number(d?.solucionados) || 0,
      trend: (d?.trend ?? []).map((t) => ({ mes: t.mes, recibidos: Number(t.recibidos) || 0, solucionados: Number(t.solucionados) || 0 })),
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
  /**
   * ¿Tiene avisos, pedidos o boletas?
   *
   * Es lo que decide si la papelera da de baja o borra de verdad, y viene de la
   * MISMA función que lo decide en el servidor (`tiene_rastro_comercial`). Si
   * el panel lo calculara por su cuenta acabaría avisando de una cosa y
   * ocurriendo otra, que es peor que no avisar.
   */
  tiene_rastro?: boolean;
}

export async function fetchAdminUsers(
  opts?: { search?: string; role?: string; status?: string },
): Promise<{ data: AdminUser[]; real: boolean }> {
  try {
    const { data, error } = await supabase.rpc("admin_list_users", {
      p_search: opts?.search || null, p_role: opts?.role || null,
      // B-01: filtrar Activos / Inactivos. Sin esto la baja existiría pero no
      // se podría consultar, que es justo lo que pedirán SUNAT o el Poder
      // Judicial cuando reclamen la relación de quienes contrataron.
      p_status: opts?.status || null,
      p_limit: 200, p_offset: 0,
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
    tiene_rastro: u.listings > 0,
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

export interface AjusteDeSaldo {
  saldo_anterior: number;
  saldo: number;
  delta: number;
}

/**
 * Mueve el saldo de un usuario en cualquier sentido (0108).
 *
 * `delta` positivo otorga y negativo devuelve. El motivo es obligatorio: es
 * dinero y tiene que quedar explicado en el historial y en la auditoría.
 */
export async function ajustarSaldo(userId: string, delta: number, motivo: string): Promise<AjusteDeSaldo> {
  const { data, error } = await supabase.rpc("admin_ajustar_saldo", {
    p_user: userId, p_delta: delta, p_motivo: motivo,
  });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    saldo_anterior: Number(r.saldo_anterior) || 0,
    saldo: Number(r.saldo) || 0,
    delta: Number(r.delta) || 0,
  };
}

// Saldo actual de un usuario. Hace falta una RPC porque `user_credits` tiene
// RLS de "solo lo mío": el panel no puede leerlo directamente.
export async function saldoDeUsuario(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc("admin_saldo_usuario", { p_user: userId });
  if (error) throw error;
  return Number(data) || 0;
}

// Quita un rol a un usuario (solo superadmin).
export async function removeUserRole(userId: string, role: string) {
  const { error } = await supabase.rpc("admin_remove_role", { p_user: userId, p_role: role });
  if (error) throw error;
}

/**
 * Da de baja a un usuario. Solo superadmin.
 *
 * Ya no borra siempre: si el usuario tiene historial comercial —algún aviso,
 * orden o comprobante— se marca `inactive` y se conserva en el maestro de
 * clientes, porque SUNAT o el Poder Judicial pueden pedir formalmente la
 * relación de quienes contrataron (punto B-01 de la auditoría). Solo se borra
 * de verdad a quien nunca contrató nada.
 *
 * Devuelve QUÉ hizo, para poder decírselo a quien pulsó el botón en vez de dar
 * por hecho que borró.
 */
export async function deleteUser(userId: string): Promise<"desactivado" | "eliminado"> {
  const { data, error } = await supabase.rpc("admin_delete_user", { p_user: userId });
  if (error) throw error;
  const r = (data ?? {}) as { accion?: string };
  return r.accion === "desactivado" ? "desactivado" : "eliminado";
}

/** Devuelve a activo a un cliente dado de baja. */
export async function reactivarUsuario(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_reactivar_usuario", { p_user: userId });
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

      const rows: AuditRow[] = (logs as FilaAuditoria[]).map((l) => ({
        id: `L-${l.id}`,
        actor: actorDe(l).email || actorDe(l).full_name || "sistema",
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
    (data as Array<{ role: string; total: number }>)?.forEach((r) => { out[r.role] = Number(r.total) || 0; });
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
// `value` es un jsonb: puede ser texto, número, booleano u objeto según la clave.
export interface SystemSetting { key: string; value: unknown; label: string | null; updated_at: string }

export async function fetchSettings(): Promise<SystemSetting[]> {
  try {
    const { data, error } = await supabase.rpc("get_settings");
    if (error) throw error;
    return (data as SystemSetting[]) ?? [];
  } catch { return []; }
}

export async function setSetting(key: string, value: unknown, label?: string) {
  const { error } = await supabase.rpc("set_setting", { p_key: key, p_value: value, p_label: label || null });
  if (error) throw error;
}

// ------------------------------------------------------------------ Comunicaciones
// Centro de mensajes del panel: envíos REALES (in-app + push, y email opcional)
// vía las RPCs security-definer de la migración 0039_admin_communications.

// Nº real de destinatarios de una audiencia ("all" | "anunciante" | "buscador").
/**
 * A quién va un envío masivo.
 *
 * Sin categorías es "todos los usuarios", que es como funcionaba antes de que
 * existiera este filtro.
 */
export interface AudienciaMasiva {
  /** Códigos de categoría. Vacío = todos los usuarios, sin filtrar. */
  categories?: string[];
  /**
   * true  → solo quien tiene un aviso VIGENTE en esas categorías.
   * false → cualquiera que haya publicado ahí alguna vez.
   */
  onlyActive?: boolean;
  /** Incluir en copia al equipo interno. */
  copyStaff?: boolean;
}

/** Los parámetros del filtro, tal como los espera la BD. */
const paramsDeAudiencia = (a: AudienciaMasiva = {}) => ({
  // Un array vacío y `null` significan lo mismo para la BD, pero se manda null
  // para que quede claro en los registros que no había filtro.
  p_categories: a.categories?.length ? a.categories : null,
  p_only_active: !!a.onlyActive,
  p_copy_staff: !!a.copyStaff,
});

export async function fetchAudienceCount(audience: string, filtro: AudienciaMasiva = {}): Promise<number> {
  const { data, error } = await supabase.rpc("admin_audience_count", {
    p_audience: audience, ...paramsDeAudiencia(filtro),
  });
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
// El filtro es el MISMO objeto que se le pasó a fetchAudienceCount, y del otro
// lado lo resuelve la misma función de la BD: el número del botón y el del
// envío no pueden salir distintos.
export async function broadcastMessage(
  audience: string, title: string, body: string, email: boolean, filtro: AudienciaMasiva = {},
): Promise<number> {
  const { p_categories, p_only_active, p_copy_staff } = paramsDeAudiencia(filtro);
  const { data, error } = await supabase.rpc("admin_broadcast", {
    p_audience: audience, p_title: title, p_body: body, p_email: email,
    p_copy_staff, p_categories, p_only_active,
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

// ------------------------------------------- Notificaciones de un usuario (B-02)

/** Los tres canales de un evento, tal como los ve el panel. */
export interface PrefCanales { in_app: boolean; push: boolean; email: boolean }

/**
 * Preferencias de notificación de un usuario, para poder ayudarle desde el panel.
 *
 * Devuelve SOLO las filas que existen. Las que no están valen los tres canales
 * activados —así lo decidió la migración 0121— y quien pinte esto tiene que
 * aplicar ese mismo criterio: si aquí se asumiera "apagado" para lo que falta,
 * el panel enseñaría todo en gris a un usuario que sí recibe sus avisos.
 */
export async function fetchPrefsDeUsuario(userId: string): Promise<Record<string, PrefCanales>> {
  const { data, error } = await supabase.rpc("admin_notification_prefs", { p_user: userId });
  if (error) throw new Error(error.message);
  const out: Record<string, PrefCanales> = {};
  for (const f of (data ?? []) as Array<{ event_type: string; in_app: boolean; push: boolean; email: boolean }>) {
    out[f.event_type] = { in_app: !!f.in_app, push: !!f.push, email: !!f.email };
  }
  return out;
}

/**
 * Activa o desactiva un canal de un usuario desde el panel.
 *
 * Va por RPC y no escribiendo la tabla: se está tocando la configuración de
 * otra persona sin que ella lo pida, y eso queda en la auditoría con el valor
 * anterior. Si mañana pregunta por qué volvió a recibir correos, hay respuesta.
 */
export async function guardarPrefDeUsuario(
  userId: string, evento: string, pref: PrefCanales,
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_notification_pref", {
    p_user: userId, p_event: evento,
    p_in_app: pref.in_app, p_push: pref.push, p_email: pref.email,
  });
  if (error) throw new Error(error.message);
}
