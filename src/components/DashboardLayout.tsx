import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import {
  Home,
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
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type MenuItem = { title: string; url: string; icon: LucideIcon };

const advertiserMenu: MenuItem[] = [
  { title: "Inicio", url: "/dashboard/anunciante", icon: Home },
  { title: "Publicar aviso", url: "/dashboard/anunciante/publicar", icon: PlusCircle },
  { title: "Mis avisos", url: "/dashboard/anunciante/avisos", icon: ClipboardList },
  { title: "Mensajes", url: "/dashboard/anunciante/mensajes", icon: MessageSquare },
  { title: "Postulaciones", url: "/dashboard/anunciante/postulaciones", icon: Users },
  { title: "Estadísticas", url: "/dashboard/anunciante/estadisticas", icon: BarChart3 },
  { title: "Configuración", url: "/dashboard/anunciante/configuracion", icon: Settings },
];

const seekerMenu: MenuItem[] = [
  { title: "Inicio", url: "/dashboard/buscador", icon: Home },
  { title: "Buscar avisos", url: "/dashboard/buscador/buscar", icon: Search },
  { title: "Favoritos", url: "/dashboard/buscador/favoritos", icon: Heart },
  { title: "Mis búsquedas", url: "/dashboard/buscador/busquedas", icon: Star },
  { title: "Mensajes", url: "/dashboard/buscador/mensajes", icon: MessageSquare },
  { title: "Alertas", url: "/dashboard/buscador/alertas", icon: Bell },
  { title: "Configuración", url: "/dashboard/buscador/configuracion", icon: Settings },
];

// Items NOT shown in the mobile bottom nav (so hamburger surfaces them)
const advertiserOverflowUrls = new Set([
  "/dashboard/anunciante/postulaciones",
  "/dashboard/anunciante/configuracion",
]);
const seekerOverflowUrls = new Set([
  "/dashboard/buscador/busquedas",
  "/dashboard/buscador/configuracion",
]);

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
          <Link
            to={`/dashboard/${role}/configuracion`}
            className="flex items-center gap-3 mb-3 p-2 -m-2 rounded-lg hover:bg-sidebar-accent/60 transition-colors"
          >
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
              <p className="text-[10px] text-sidebar-foreground/50 truncate">Ver mi perfil</p>
            </div>
          </Link>
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
            <div className="w-8 h-8 rounded-md gradient-secondary flex items-center justify-center text-secondary-foreground font-extrabold text-sm shadow-sm">
              eF
            </div>
          </Link>
          <div className="hidden lg:block">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
              {isAdvertiser ? "Anunciante" : "Buscador"}
            </p>
            <h2 className="text-base font-bold text-foreground leading-none">{currentTitle}</h2>
          </div>
          <div className="lg:hidden flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">{currentTitle}</h2>
            <p className="text-[10px] uppercase tracking-wider text-secondary font-bold leading-none">
              {isAdvertiser ? "Anunciante" : "Buscador"}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2 lg:gap-4">
            <button className="hidden md:flex w-9 h-9 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground">
              <Bell size={18} />
            </button>
            <span className="hidden md:inline text-sm text-muted-foreground">
              {isAdvertiser ? "Juan Mendoza" : "Ana García"}
            </span>
            <Link
              to={`/dashboard/${role}/configuracion`}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm hover:ring-2 hover:ring-secondary/40 transition ${
                isAdvertiser ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"
              }`}
              aria-label="Mi perfil"
            >
              {isAdvertiser ? "JM" : "AG"}
            </Link>
            {/* Hamburger - mobile only, top right */}
            <MobileHamburger role={role} menuItems={menuItems} />
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 lg:py-8 pb-24 lg:pb-8 bg-background">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav (5 primary items only) */}
      <MobileBottomNav role={role} />
    </div>
  );
}

function MobileHamburger({ role, menuItems }: { role: "anunciante" | "buscador"; menuItems: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const homeUrl = `/dashboard/${role}`;
  const overflowSet = role === "anunciante" ? advertiserOverflowUrls : seekerOverflowUrls;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Abrir menú"
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-md bg-primary/5 hover:bg-primary/10 text-primary transition-colors"
        >
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 p-0 bg-sidebar text-sidebar-foreground border-l-0">
        <SheetHeader className="p-5 border-b border-sidebar-border/40 text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg gradient-secondary flex items-center justify-center text-secondary-foreground font-extrabold">
              eF
            </div>
            <div>
              <SheetTitle className="text-sidebar-foreground text-sm">
                eFFe<span className="text-sidebar-primary"> Multi</span>
              </SheetTitle>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                Panel {role === "anunciante" ? "Anunciante" : "Buscador"}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="p-3 flex flex-col gap-0.5">
          <p className="px-3 py-2 text-[10px] uppercase tracking-widest font-semibold text-sidebar-foreground/40">
            Más opciones
          </p>
          {menuItems
            .filter((item) => overflowSet.has(item.url))
            .map((item) => {
              const active = pathname.startsWith(item.url);
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  }`}
                >
                  <item.icon size={18} />
                  <span className="flex-1">{item.title}</span>
                </Link>
              );
            })}

          <div className="border-t border-sidebar-border/40 my-3" />

          <Link
            to="/auth"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-secondary hover:bg-secondary/10 transition-colors"
          >
            <LogOut size={18} />
            Cambiar rol / Salir
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
