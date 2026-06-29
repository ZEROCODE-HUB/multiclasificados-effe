// REQ-05: mensajería en tiempo real comprador ↔ anunciante.
// Estados de mensaje: sent (Enviado) → delivered (Recibido) → read (Leído).
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type MessageStatus = "sent" | "delivered" | "read";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  status: MessageStatus;
  read_at: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  last_message: string | null;
  last_message_at: string | null;
  listing_title: string;
  listing_category: string;
  counterpart_id: string;
  counterpart_name: string;
  unread: number;
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Crea (o reutiliza) la conversación entre el comprador actual y el dueño del aviso.
// Devuelve el id de la conversación.
export async function getOrCreateConversation(
  listingId: string,
  sellerId: string
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión para enviar mensajes.");
  if (user.id === sellerId) throw new Error("No puedes iniciar un chat contigo mismo.");

  // ¿Ya existe?
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", user.id)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from("conversations")
    .insert({ listing_id: listingId, buyer_id: user.id, seller_id: sellerId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// Lista las conversaciones del usuario actual con nombre del otro y no leídos.
export async function fetchConversations(): Promise<Conversation[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  try {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, listing_id, buyer_id, seller_id, last_message, last_message_at, listings(title, category_id)")
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) return [];

    // Nombres del otro participante.
    const others = [...new Set(rows.map((r: any) => (r.buyer_id === user.id ? r.seller_id : r.buyer_id)))];
    const names = new Map<string, string>();
    if (others.length) {
      const { data: profs } = await supabase
        .from("public_profiles")
        .select("id, full_name")
        .in("id", others);
      (profs ?? []).forEach((p: { id: string; full_name: string }) => names.set(p.id, p.full_name));
    }

    // No leídos: mensajes dirigidos a mí sin leer, por conversación.
    const unreadByConv = new Map<string, number>();
    const { data: unreadRows } = await supabase
      .from("messages")
      .select("conversation_id")
      .is("read_at", null)
      .neq("sender_id", user.id);
    (unreadRows ?? []).forEach((m: { conversation_id: string }) => {
      unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
    });

    return rows.map((r: any): Conversation => {
      const counterpartId = r.buyer_id === user.id ? r.seller_id : r.buyer_id;
      return {
        id: r.id,
        listing_id: r.listing_id,
        buyer_id: r.buyer_id,
        seller_id: r.seller_id,
        last_message: r.last_message,
        last_message_at: r.last_message_at,
        listing_title: r.listings?.title ?? "Aviso",
        listing_category: r.listings?.category_id ?? "",
        counterpart_id: counterpartId,
        counterpart_name: names.get(counterpartId) ?? "Usuario",
        unread: unreadByConv.get(r.id) ?? 0,
      };
    });
  } catch {
    return [];
  }
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, status, read_at, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ChatMessage[];
  } catch {
    return [];
  }
}

export async function sendMessage(conversationId: string, body: string): Promise<ChatMessage | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Debes iniciar sesión.");
  const text = body.trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: user.id, body: text })
    .select("id, conversation_id, sender_id, body, status, read_at, created_at")
    .single();
  if (error) throw error;
  return data as ChatMessage;
}

// Marca como "recibidos" los mensajes del otro al abrir la conversación.
// Total de mensajes no leídos dirigidos a mí (en todas mis conversaciones).
// La RLS limita `messages` a mis conversaciones, así que el conteo es el mío.
export async function fetchUnreadCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  try {
    const { count, error } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .neq("sender_id", user.id);
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Suscripción dedicada para el badge de no leídos del navbar.
export function subscribeToUnread(onChange: () => void): RealtimeChannel {
  return supabase
    .channel(uniqueChannel("unread-badge"))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, onChange)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, onChange)
    .subscribe();
}

export async function markDelivered(conversationId: string): Promise<void> {
  await supabase.rpc("mark_messages_delivered", { p_conversation: conversationId });
}

// Marca como "leídos" los mensajes del otro.
export async function markRead(conversationId: string): Promise<void> {
  await supabase.rpc("mark_messages_read", { p_conversation: conversationId });
}

// Contador para garantizar nombres de canal únicos por instancia de
// suscripción (evita "cannot add callbacks after subscribe()" cuando dos
// componentes —o el doble montaje de React en dev— usan el mismo nombre).
let channelSeq = 0;
const uniqueChannel = (base: string) => `${base}:${(channelSeq += 1)}`;

// Suscripción en tiempo real a los mensajes de UNA conversación.
export function subscribeToMessages(
  conversationId: string,
  onInsert: (m: ChatMessage) => void,
  onUpdate: (m: ChatMessage) => void
): RealtimeChannel {
  return supabase
    .channel(uniqueChannel(`messages:${conversationId}`))
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => onInsert(payload.new as ChatMessage)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => onUpdate(payload.new as ChatMessage)
    )
    .subscribe();
}

// Suscripción a cambios en mis conversaciones (para refrescar la lista).
export function subscribeToConversations(onChange: () => void): RealtimeChannel {
  return supabase
    .channel(uniqueChannel("my-conversations"))
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, onChange)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, onChange)
    .subscribe();
}

export function unsubscribe(channel: RealtimeChannel | null) {
  if (channel) supabase.removeChannel(channel);
}
