import { Link, useLocation } from "react-router-dom";
import {
  Home,
  PlusCircle,
  MessageSquare,
  Search,
  Heart,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOBILE_NAV, MOBILE_NAV_INNER } from "@/components/mobileNav.styles";
import { useSession } from "@/hooks/useSession";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

type Item = { title: string; url: string; icon: LucideIcon };

const advertiserPrimary: Item[] = [
  { title: "Inicio", url: "/", icon: Home },
  { title: "Explorar", url: "/buscar", icon: Search },
  { title: "Publicar", url: "/dashboard/anunciante/publicar", icon: PlusCircle },
  { title: "Mensajes", url: "/dashboard/anunciante/mensajes", icon: MessageSquare },
  { title: "Mi cuenta", url: "/dashboard/anunciante", icon: User },
];

const seekerPrimary: Item[] = [
  { title: "Inicio", url: "/", icon: Home },
  { title: "Explorar", url: "/buscar", icon: Search },
  { title: "Favoritos", url: "/dashboard/buscador/favoritos", icon: Heart },
  { title: "Mensajes", url: "/dashboard/buscador/mensajes", icon: MessageSquare },
  { title: "Mi cuenta", url: "/dashboard/buscador", icon: User },
];

/** Bottom nav for logged-in seeker/advertiser. Hidden on /auth and for guests/admins. */
export function MobileBottomNav() {
  const { pathname, search } = useLocation();
  const session = useSession();
  const unread = useUnreadMessages();

  if (!session) return null;
  if (session.role !== "anunciante" && session.role !== "buscador") return null;
  if (pathname.startsWith("/auth")) return null;
  // Dentro de una conversación abierta la barra desaparece (MOB-02). Con el
  // teclado abierto en iOS el WebView se encoge, pero estos 5 iconos seguían
  // reservando sus 4rem justo encima del teclado: la barra de escribir quedaba
  // flotando con un hueco debajo en vez de acoplarse al teclado como en
  // WhatsApp. La conversación abierta se sabe por la URL (?c=<id>), que es lo
  // que escribe MessagesPage al entrar en un chat.
  if (/\/mensajes\/?$/.test(pathname) && new URLSearchParams(search).has("c")) return null;

  const primary = session.role === "anunciante" ? advertiserPrimary : seekerPrimary;

  // Cuánto coincide una ruta con la URL actual (-1 = no coincide).
  // "/dashboard/buscador" es prefijo de "/dashboard/buscador/favoritos",
  // así que elegimos SOLO el item más específico (coincidencia más larga).
  const matchLen = (url: string) => {
    if (url === "/") return pathname === "/" ? 0 : -1;
    if (pathname === url || pathname.startsWith(url + "/")) return url.length;
    return -1;
  };
  const activeUrl = primary.reduce(
    (best, it) => (matchLen(it.url) > best.len ? { url: it.url, len: matchLen(it.url) } : best),
    { url: "", len: -1 },
  ).url;
  const isActive = (url: string) => url === activeUrl;

  return (
    <nav className={MOBILE_NAV}>
      <div className={MOBILE_NAV_INNER}>
        {primary.map((item) => {
          const active = isActive(item.url);
          const showBadge = item.icon === MessageSquare && unread > 0;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-all relative",
                active ? "text-secondary" : "text-primary-foreground/60 hover:text-primary-foreground"
              )}
            >
              {active && <span className="absolute top-0 h-1 w-12 bg-secondary rounded-b-full shadow-[0_2px_8px_rgba(249,115,22,0.6)]" />}
              <div className="relative">
                <item.icon size={active ? 22 : 20} strokeWidth={active ? 2.5 : 2} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[9px] font-bold bg-secondary text-secondary-foreground rounded-full">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </div>
              {/* Sin truncado ni ancho fijo: en 375px (iPhone SE) "Favoritos"
                  salía como "Favori...". Con el tipo un punto más chico entra
                  entero en las cinco columnas. */}
              <span className="max-w-full px-0.5 text-[9.5px] leading-tight text-center">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
