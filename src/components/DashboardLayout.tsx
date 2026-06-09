import { Link, useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { MobileBottomNav } from "@/components/MobileBottomNav";
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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type MenuItem = { title: string; url: string; icon: LucideIcon };

const advertiserMenu: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard/anunciante", icon: LayoutDashboard },
  { title: "Publicar aviso", url: "/dashboard/anunciante/publicar", icon: PlusCircle },
  { title: "Mis avisos", url: "/dashboard/anunciante/avisos", icon: ClipboardList },
  { title: "Mensajes", url: "/dashboard/anunciante/mensajes", icon: MessageSquare },
  { title: "Postulaciones", url: "/dashboard/anunciante/postulaciones", icon: Users },
  { title: "Estadísticas", url: "/dashboard/anunciante/estadisticas", icon: BarChart3 },
  { title: "Configuración", url: "/dashboard/anunciante/configuracion", icon: Settings },
];

const seekerMenu: MenuItem[] = [
  { title: "Inicio", url: "/dashboard/buscador", icon: LayoutDashboard },
  { title: "Buscar avisos", url: "/dashboard/buscador/buscar", icon: Search },
  { title: "Favoritos", url: "/dashboard/buscador/favoritos", icon: Heart },
  { title: "Mis búsquedas", url: "/dashboard/buscador/busquedas", icon: Star },
  { title: "Mensajes", url: "/dashboard/buscador/mensajes", icon: MessageSquare },
  { title: "Alertas", url: "/dashboard/buscador/alertas", icon: Bell },
  { title: "Configuración", url: "/dashboard/buscador/configuracion", icon: Settings },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: "anunciante" | "buscador";
}

export function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const isAdvertiser = role === "anunciante";
  const menuItems = isAdvertiser ? advertiserMenu : seekerMenu;
  const { pathname } = useLocation();
  const homeUrl = `/dashboard/${role}`;
  const currentTitle =
    menuItems.find((m) => (m.url === homeUrl ? pathname === m.url : pathname.startsWith(m.url)))?.title ??
    (isAdvertiser ? "Panel de Anunciante" : "Panel de Buscador");

  return (
    <div className="min-h-screen flex w-full bg-muted/30">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 xl:w-72 flex-col bg-sidebar text-sidebar-foreground sticky top-0 h-screen">
        <div className="px-6 py-5 border-b border-sidebar-border/40">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-secondary flex items-center justify-center text-secondary-foreground font-extrabold">
              eF
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-extrabold text-sidebar-foreground tracking-tight">
                eFFe<span className="text-sidebar-primary"> Multi</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                Clasificados
              </span>
            </div>
          </Link>
        </div>

        <div className="px-3 py-2 mt-2">
          <p className="px-3 text-[10px] uppercase tracking-widest font-semibold text-sidebar-foreground/40 mb-2">
            {isAdvertiser ? "Panel Anunciante" : "Panel Buscador"}
          </p>
          <nav className="flex flex-col gap-0.5">
            {menuItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === homeUrl}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                activeClassName="!bg-sidebar-accent !text-sidebar-primary-foreground shadow-sm relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r before:bg-sidebar-primary"
              >
                <item.icon size={18} />
                <span>{item.title}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-sidebar-border/40">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                isAdvertiser ? "bg-secondary text-secondary-foreground" : "bg-sidebar-primary text-sidebar-primary-foreground"
              }`}
            >
              {isAdvertiser ? "JM" : "AG"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {isAdvertiser ? "Juan Mendoza" : "Ana García"}
              </p>
              <p className="text-[10px] text-sidebar-foreground/50 truncate">
                {isAdvertiser ? "Cuenta Pro" : "Cuenta gratuita"}
              </p>
            </div>
          </div>
          <Link to="/auth">
            <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60">
              <LogOut size={14} />
              Cambiar rol
            </Button>
          </Link>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 flex items-center bg-card/95 backdrop-blur-md border-b px-4 lg:px-8 gap-3">
          <Link to="/" className="lg:hidden flex items-center gap-2">
            <div className="w-8 h-8 rounded-md gradient-secondary flex items-center justify-center text-secondary-foreground font-extrabold text-sm">
              eF
            </div>
          </Link>
          <div className="hidden lg:block">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
              {isAdvertiser ? "Anunciante" : "Buscador"}
            </p>
            <h2 className="text-base font-bold text-foreground leading-none">{currentTitle}</h2>
          </div>
          <div className="lg:hidden flex-1">
            <h2 className="text-sm font-bold text-foreground">{currentTitle}</h2>
          </div>

          <div className="ml-auto flex items-center gap-2 lg:gap-4">
            <button className="hidden md:flex w-9 h-9 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground">
              <Bell size={18} />
            </button>
            <span className="hidden md:inline text-sm text-muted-foreground">
              {isAdvertiser ? "Juan Mendoza" : "Ana García"}
            </span>
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                isAdvertiser ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              {isAdvertiser ? "JM" : "AG"}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 lg:py-8 pb-24 lg:pb-8 bg-background">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav role={role} />
    </div>
  );
}
