/**
 * Stubs de todo lo que el chat y el Navbar consultan al backend. Los que se
 * montan de verdad son `MessagesPage`, `DashboardLayout` y `Navbar` — que son
 * justo los que se reparten el alto de la pantalla.
 */

// Suficientes mensajes para que la lista tenga que scrollear por dentro.
const MENSAJES = Array.from({ length: 30 }, (_, i) => ({
  id: `m-${i}`,
  conversation_id: "conv-1",
  sender_id: i % 2 === 0 ? "me" : "other",
  body: `Mensaje número ${i + 1} de la conversación.`,
  status: "read" as const,
  created_at: `2026-07-09T10:${String(i).padStart(2, "0")}:00Z`,
}));

const CONV = {
  id: "conv-1", listing_id: "lst-1", buyer_id: "me", seller_id: "other",
  last_message: "Mensaje número 30 de la conversación.",
  last_message_at: "2026-07-09T10:29:00Z",
  listing_title: "Toyota Yaris 2019", listing_category: "vehiculos",
  counterpart_id: "other", counterpart_name: "Ana García", unread: 0,
};

// --- @/lib/messaging
export const fetchConversations = async () => [CONV];
export const fetchMessages = async () => MENSAJES;
export const sendMessage = async () => null;
export const markDelivered = async () => {};
export const markRead = async () => {};
export const subscribeToMessages = () => null;
export const subscribeToConversations = () => null;
export const unsubscribe = () => {};
export const getCurrentUserId = async () => "me";

// --- @/lib/pricing
export const loadSold = () => ({});
export const markSold = () => {};

// --- @/lib/reports
export const reportUser = async () => {};
export const USER_REPORT_REASONS = ["Posible estafador", "Spam o mensajes no deseados"];

// --- @/lib/supabase
export const supabase = {
  auth: { getUser: async () => ({ data: { user: null } }) },
  functions: { invoke: async () => ({ data: null, error: null }) },
};

// --- @/hooks/use-toast
export const toast = () => {};
export const useToast = () => ({ toast, dismiss: () => {}, toasts: [] });

// --- @/hooks/useSession
export const useSession = () => ({ role: "buscador", name: "Yo", email: "yo@correo.com", supabase: true });
export const getSession = () => null;
export const clearSession = () => {};
export const isStaffRole = () => false;

// --- @/hooks/useCategories · @/hooks/useUnreadMessages
export const useCategories = () => [];
export const useUnreadMessages = () => 0;

// --- @/components/NotificationsBell · @/components/CreditsBalance
export const NotificationsBell = () => null;
export const CreditsBalance = () => null;

// --- @/lib/auth
export const signOut = async () => {};
