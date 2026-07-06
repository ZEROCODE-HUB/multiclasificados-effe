import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, Search, MessageSquare, ClipboardCheck, Star, AlertTriangle, ShieldAlert, Megaphone } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/hooks/useSession";
import {
  fetchNotifications, fetchUnreadNotifications, markAllNotificationsRead, markNotificationRead,
  subscribeToNotifications, unsubscribeNotifications, getMyUserId, notificationText, notificationLink,
  type AppNotification,
} from "@/lib/notifications";

const iconFor = (type: string) => {
  switch (type) {
    case "admin_message": return Megaphone;
    case "saved_search_match": return Search;
    case "new_message": return MessageSquare;
    case "application_status": return ClipboardCheck;
    case "new_review": return Star;
    case "moderation_warning": return AlertTriangle;
    case "account_suspended": return ShieldAlert;
    default: return Bell;
  }
};

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
};

export function NotificationsBell() {
  const session = useSession();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!session?.supabase) {
      setItems([]); setUnread(0);
      return;
    }
    let active = true;
    const refresh = () => {
      fetchNotifications().then((n) => active && setItems(n));
      fetchUnreadNotifications().then((c) => active && setUnread(c));
    };
    refresh();

    let channel: ReturnType<typeof subscribeToNotifications> | null = null;
    getMyUserId().then((uid) => {
      if (uid && active) channel = subscribeToNotifications(uid, refresh);
    });
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      unsubscribeNotifications(channel);
      window.removeEventListener("focus", onFocus);
    };
  }, [session?.supabase, session?.name]);

  const handleClick = async (n: AppNotification) => {
    setOpen(false);
    if (!n.read_at) {
      await markNotificationRead(n.id);
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    const to = notificationLink(n, session?.role ?? "buscador");
    if (to && to !== "#") navigate(to);
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    setUnread(0);
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
  };

  if (!session?.supabase) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className="relative p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors outline-none"
        title="Notificaciones"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold bg-secondary text-secondary-foreground rounded-full">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-card rounded-none p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-sm font-bold text-foreground">Notificaciones</span>
          {unread > 0 && (
            <button onClick={markAll} className="text-[11px] font-semibold text-secondary hover:underline flex items-center gap-1">
              <Check size={12} /> Marcar todas leídas
            </button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              <Bell size={28} className="mx-auto mb-2 text-muted-foreground/40" />
              No tienes notificaciones.
            </div>
          ) : (
            items.map((n) => {
              const Icon = iconFor(n.type);
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full flex items-start gap-3 px-3 py-3 text-left border-b border-border hover:bg-muted/50 transition-colors ${
                    n.read_at ? "" : "bg-secondary/5"
                  }`}
                >
                  <div className={`mt-0.5 p-1.5 rounded-full flex-shrink-0 ${n.read_at ? "bg-muted text-muted-foreground" : "bg-secondary/15 text-secondary"}`}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">{n.title ?? "Notificación"}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{notificationText(n)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read_at && <span className="mt-1 w-2 h-2 rounded-full bg-secondary flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
