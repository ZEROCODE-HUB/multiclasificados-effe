/**
 * Stubs de los módulos con los que AdminReports habla al backend. El componente
 * que se monta es el REAL —incluido el botón PDF y `lib/exportReport`—; solo se
 * corta el acceso a Supabase.
 */

// Con tildes y ñ a propósito: es lo que más fácil se rompe al codificar el PDF.
export const CATEGORIAS = [
  { cat: "Vehículos", avisos: 12, monto: 350.5 },
  { cat: "Inmuebles y terrenos en la sierra", avisos: 7, monto: 1280 },
  { cat: "Empleos", avisos: 3, monto: 0 },
];

// --- @/lib/admin
export const fetchCategoryDistribution = async () => CATEGORIAS;
export const fetchCategoryRevenue = async () => CATEGORIAS;
export const fetchRegionDistribution = async () => [{ reg: "Áncash", avisos: 5, monto: 100 }];
export const fetchClaimsSummary = async () => ({ recibidos: 2, pendientes: 1, solucionados: 1, trend: [] });
export const fetchGrowthSeries = async () => [{ mes: "Ene", ingresos: 100, usuarios: 4 }];

// --- @/hooks/useCategories (devuelve el array, no un objeto)
export const useCategories = () => [];

// --- @/lib/supabase
export const supabase = { functions: { invoke: async () => ({ data: null, error: null }) } };

// --- @/hooks/use-toast
export const toast = () => {};
export const useToast = () => ({ toast, dismiss: () => {}, toasts: [] });

// Tamaño de página de las transacciones de crédito. Lo importa el panel real
// (src/lib/admin.ts); el stub tiene que exportarlo o el bundle no compila.
export const CREDIT_TX_PAGE_SIZE = 20;

// Transacciones de crédito de la pestaña de reportes. Vacías: la prueba mira
// que la exportación (PDF/CSV/Excel) funcione, no los datos.
export const fetchAdminCreditTransactions = async () => ({ data: [], total: 0 });

// Permisos del usuario (usePermissions los pide al montar el panel). Todos
// concedidos: la prueba mira la exportación, no el control de acceso.
export const getMyPermissions = async () =>
  new Proxy({}, { get: () => ({ can_view: true, can_edit: true, can_approve: true, can_delete: true }) });
