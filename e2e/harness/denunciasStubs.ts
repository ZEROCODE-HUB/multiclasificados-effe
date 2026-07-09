/**
 * Stubs del backend para montar SuperConversations en Chromium. El componente es
 * el REAL: los botones, el estado `busy` y el enlace al aviso son los de producción.
 *
 * Las llamadas se cuentan en `window.__calls` para que el spec pueda comprobar
 * que un doble toque no asigna la denuncia dos veces.
 */

export const LISTING_ID = "22222222-2222-4222-8222-222222222222";
export const REPORT_ID = "33333333-3333-4333-8333-333333333333";
const MOD_ID = "11111111-1111-4111-8111-111111111111";

interface Calls { assign: number; resolve: string[] }
const calls: Calls = { assign: 0, resolve: [] };
(globalThis as unknown as { __calls: Calls }).__calls = calls;

// El estado vive aquí: assignReport lo mueve a 'reviewing' y la recarga lo refleja.
let status = "open";

const reporte = () => ({
  id: REPORT_ID,
  target_type: "listing",
  reason: "Posible estafa o fraude",
  category: null,
  status,
  action_taken: null,
  reporter: "Ana García",
  reported: "Luis Paz",
  reporter_id: "44444444-4444-4444-8444-444444444444",
  reported_id: "55555555-5555-4555-8555-555555555555",
  listing_id: LISTING_ID,
  listing_title: "Camioneta 4x4",
  assigned_to: null,
  assignee: null,
  created_at: "2026-07-01T00:00:00Z",
});

const lento = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- @/lib/admin
export const fetchReports = async () => ({ data: [reporte()], real: true });
export const fetchConversationBetween = async () => [];
export const assignReport = async () => {
  calls.assign++;
  await lento(300); // la petición tarda: es la ventana en la que se cuela el doble toque
  status = "reviewing";
};
export const resolveReport = async (_id: string, action: string) => {
  calls.resolve.push(action);
  await lento(50);
  status = "resolved";
};

// --- @/lib/supabase
export const supabase = { auth: { getUser: async () => ({ data: { user: { id: MOD_ID } } }) } };

// --- @/hooks/use-toast
export const toast = () => {};
export const useToast = () => ({ toast, dismiss: () => {}, toasts: [] });
