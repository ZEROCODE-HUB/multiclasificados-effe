import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  MessageSquare,
  Users,
  Settings,
  LogOut,
  Search,
  Heart,
  Bell,
  BarChart3,
  Star,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Item = { title: string; url: string; icon: LucideIcon };

const advertiserPrimary: Item[] = [
  { title: "Inicio", url: "/dashboard/anunciante", icon: LayoutDashboard },
  { title: "Publicar", url: "/dashboard/anunciante/publicar", icon: PlusCircle },
  { title: "Avisos", url: "/dashboard/anunciante/avisos", icon: ClipboardList },
  { title: "Mensajes", url: "/dashboard/anunciante/mensajes", icon: MessageSquare },
];
const advertiserOverflow: Item[] = [
  { title: "Postulaciones", url: "/dashboard/anunciante/postulaciones", icon: Users },
  { title: "Estadísticas", url: "/dashboard/anunciante/estadisticas", icon: BarChart3 },
  { title: "Configuración", url: "/dashboard/anunciante/configuracion", icon: Settings },
];

const seekerPrimary: Item[] = [
  { title: "Inicio", url: "/dashboard/buscador", icon: LayoutDashboard },
  { title: "Buscar", url: "/dashboard/buscador/buscar", icon: Search },
  { title: "Favoritos", url: "/dashboard/buscador/favoritos", icon: Heart },
  { title: "Mensajes", url: "/dashboard/buscador/mensajes", icon: MessageSquare },
];
const seekerOverflow: Item[] = [
  { title: "Mis búsquedas", url: "/dashboard/buscador/busquedas", icon: Star },
  { title: "Alertas", url: "/dashboard/buscador/alertas", icon: Bell },
  { title: "Configuración", url: "/dashboard/buscador/configuracion", icon: Settings },
];

interface Props {
  role: "anunciante" | "buscador";
}

export function MobileBottomNav({ role }: Props) {
  const { pathname } = useLocation();
  const primary = role === "anunciante" ? advertiserPrimary : seekerPrimary;
  const overflow = role === "anunciante" ? advertiserOverflow : seekerOverflow;
  const homeUrl = `/dashboard/${role}`;

  const isActive = (url: string) => (url === homeUrl ? pathname === url : pathname.startsWith(url));

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.08)]">
      <div className="grid grid-cols-5 h-16 safe-area-inset-bottom">
        {primary.map((item) => {
          const active = isActive(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors relative",
                active ? "text-secondary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && <span className="absolute top-0 h-0.5 w-10 bg-secondary rounded-b-full" />}
              <item.icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span className="truncate max-w-[60px]">{item.title}</span>
            </Link>
          );
        })}
        <OverflowSheet role={role} overflow={overflow} />
      </div>
    </nav>
  );
}

function OverflowSheet({ role, overflow }: { role: "anunciante" | "buscador"; overflow: Item[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex flex-col items-center justify-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground">
          <Menu size={20} />
          <span>Más</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0">
        <SheetHeader className="p-5 border-b">
          <SheetTitle className="text-left">
            {role === "anunciante" ? "Panel Anunciante" : "Panel Buscador"}
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">Más opciones</p>
        </SheetHeader>
        <div className="flex flex-col p-2">
          {overflow.map((item) => (
            <Link
              key={item.url}
              to={item.url}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-foreground hover:bg-muted transition-colors"
            >
              <item.icon size={18} className="text-muted-foreground" />
              {item.title}
            </Link>
          ))}
          <div className="border-t my-2" />
          <Link
            to="/auth"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut size={18} />
            Cambiar rol / Salir
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
