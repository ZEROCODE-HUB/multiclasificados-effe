import { useEffect, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { fetchUnreadCount, subscribeToUnread, unsubscribe } from "@/lib/messaging";

// Cantidad de mensajes no leídos del usuario, actualizada en tiempo real.
// Solo cuenta para sesiones reales de Supabase (no para los botones demo).
export function useUnreadMessages(): number {
  const session = useSession();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!session?.supabase) {
      setCount(0);
      return;
    }
    let active = true;
    const refresh = () => {
      fetchUnreadCount().then((c) => active && setCount(c));
    };
    refresh();

    // Realtime: nuevos mensajes (INSERT) y marcas de leído (UPDATE).
    const channel = subscribeToUnread(refresh);
    // También al volver a la pestaña (por si se perdió algún evento).
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      unsubscribe(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [session?.supabase, session?.name]);

  return count;
}
