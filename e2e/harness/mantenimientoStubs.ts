/**
 * Stubs para montar MaintenanceGate en Chromium. El componente es el REAL; se
 * cortan solo la lectura del ajuste (que iría a Supabase) y la sesión.
 *
 * El spec configura `window.__mantenimiento` y `window.__sesion` antes de montar.
 */

interface W {
  __mantenimiento?: boolean;
  __lento?: boolean;
  __sesion?: { role: string } | null;
}
const w = () => window as unknown as W;

// --- @/lib/maintenance
export const fetchMaintenanceMode = async () => {
  if (w().__lento) await new Promise(() => {}); // nunca resuelve: estado "comprobando"
  return w().__mantenimiento === true;
};

// --- @/hooks/useSession
export const useSession = () => w().__sesion ?? null;
export const isStaffRole = (role?: string | null) => role === "admin" || role === "superadmin";

// --- @/lib/supabase
export const supabase = { rpc: async () => ({ data: null, error: null }) };
