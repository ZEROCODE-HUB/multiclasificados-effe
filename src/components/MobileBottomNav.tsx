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
import { useSession } from "@/hooks/useSession";

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
  const { pathname } = useLocation();
  const session = useSession();

  if (!session) return null;
  if (session.role !== "anunciante" && session.role !== "buscador") return null;
  if (pathname.startsWith("/auth")) return null;

  const primary = session.role === "anunciante" ? advertiserPrimary : seekerPrimary;
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/"));

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-primary text-primary-foreground border-t border-primary/40 shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.25)]">
      <div className="grid grid-cols-5 h-16">
        {primary.map((item) => {
          const active = isActive(item.url);
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
              <item.icon size={active ? 22 : 20} strokeWidth={active ? 2.5 : 2} />
              <span className="truncate max-w-[60px]">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
