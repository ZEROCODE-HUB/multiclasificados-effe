import { Link, useLocation, Outlet, Navigate } from "react-router-dom";
import { useState, Suspense } from "react";
import { NavLink } from "@/components/NavLink";
import { usePermissions, type Can } from "@/hooks/usePermissions";
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  Send,
  Tags,
  DollarSign,
  FileBarChart,
  ShieldCheck,
  Settings,
  ScrollText,
  Lock,
  Flag,
  Menu,
  LogOut,
  Bell,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth";

// Cierra la sesión real (Supabase + estado local) y va al login.
async function handleLogout() {
  try {
    await signOut();
  } finally {
    window.location.href = "/auth";
  }
}

export type AdminRole = "admin" | "superadmin";

type MenuItem = { title: string; url: string; icon: LucideIcon; group?: string; module?: string };

// Módulo de la matriz de permisos por sub-ruta (para filtrar menú y bloquear
// el acceso directo por URL). Dashboard y Roles no se filtran.
const MODULE_BY_SUB: Record<string, string> = {
  avisos: "Gestión de avisos",
  usuarios: "Gestión de usuarios",
  comercial: "Configuración comercial",
  tarifas: "Pagos y planes",
  conversaciones: "Conversaciones reportadas",
  reportes: "Reportes",
  comunicaciones: "Comunicaciones",
  auditoria: "Auditoría y logs",
};

const buildMenu = (role: AdminRole): MenuItem[] => {
  const base: MenuItem[] = [
    { title: "Dashboard", url: `/dashboard/${role}`, icon: LayoutDashboard, group: "Principal" },
    { title: "Gestión de avisos", url: `/dashboard/${role}/avisos`, icon: ClipboardList, group: "Operación", module: "Gestión de avisos" },
    { title: "Gestión de usuarios", url: `/dashboard/${role}/usuarios`, icon: Users, group: "Operación", module: "Gestión de usuarios" },
    { title: "Config. comercial", url: `/dashboard/${role}/comercial`, icon: Tags, group: "Operación", module: "Configuración comercial" },
    { title: "Tarifas y Descuentos", url: `/dashboard/${role}/tarifas`, icon: DollarSign, group: "Operación", module: "Pagos y planes" },
    { title: "Denuncias", url: `/dashboard/${role}/conversaciones`, icon: Flag, group: "Operación", module: "Conversaciones reportadas" },
    { title: "Reportes", url: `/dashboard/${role}/reportes`, icon: FileBarChart, group: "Operación", module: "Reportes" },
    { title: "Comunicaciones", url: `/dashboard/${role}/comunicaciones`, icon: Send, group: "Comunicaciones", module: "Comunicaciones" },
  ];
  if (role === "admin") return base;
  return [
    ...base,
    { title: "Roles y permisos", url: `/dashboard/superadmin/roles`, icon: ShieldCheck, group: "Plataforma" },
    { title: "Auditoría y logs", url: `/dashboard/superadmin/auditoria`, icon: ScrollText, group: "Plataforma", module: "Auditoría y logs" },
  ];
};

const primaryMobile = (role: AdminRole): MenuItem[] => [
  { title: "Inicio", url: `/dashboard/${role}`, icon: LayoutDashboard },
  { title: "Avisos", url: `/dashboard/${role}/avisos`, icon: ClipboardList, module: "Gestión de avisos" },
  { title: "Usuarios", url: `/dashboard/${role}/usuarios`, icon: Users, module: "Gestión de usuarios" },
  { title: "Reportes", url: `/dashboard/${role}/reportes`, icon: FileBarChart, module: "Reportes" },
  { title: "Comunic.", url: `/dashboard/${role}/comunicaciones`, icon: Send, module: "Comunicaciones" },
];

interface Props {
  children: React.ReactNode;
  role: AdminRole;
  title: string;
  breadcrumb?: string[];
  /** Aplica la matriz de permisos: oculta ítems del menú sin can_view. */
  can?: Can;
}

export function AdminLayout({ children, role, title, breadcrumb, can }: Props) {
  const menu = buildMenu(role).filter((m) => (can ? can(m.module, "view") : true));
  const isSuper = role === "superadmin";
  const groups = Array.from(new Set(menu.map((m) => m.group ?? "")));

  return (
    <div className="h-screen flex w-full bg-muted/30 overflow-hidden">
      {/* Sidebar desktop — columna con fondo a TODA la altura (evita franja clara
          bajo el sidebar cuando el contenido supera el alto de pantalla) y el
          contenido "sticky" adentro. */}
      <div className="hidden lg:block lg:w-64 xl:w-72 bg-sidebar text-sidebar-foreground h-full">
      <aside className="flex flex-col h-full">
        <div className="px-6 py-5 border-b border-sidebar-border/40">
          <Link to="/" className="flex items-center gap-2">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-extrabold",
              isSuper ? "bg-gradient-to-br from-secondary to-primary text-white" : "gradient-secondary text-secondary-foreground"
            )}>
              eF
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-extrabold tracking-tight">
                eFFe<span className="text-sidebar-primary"> Multi</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                {isSuper ? "Super Admin" : "Administración"}
              </span>
            </div>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <p className="px-3 text-[10px] uppercase tracking-widest font-semibold text-sidebar-foreground/40 mb-2">{g}</p>
              <nav className="flex flex-col gap-0.5">
                {menu.filter((m) => (m.group ?? "") === g).map((item) => (
                  <NavLink
                    key={item.url}
                    to={item.url}
                    end={item.url === `/dashboard/${role}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                    activeClassName="!bg-sidebar-accent !text-sidebar-primary-foreground shadow-sm relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r before:bg-sidebar-primary"
                  >
                    <item.icon size={18} />
                    <span>{item.title}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-sidebar-border/40">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold",
              isSuper ? "bg-gradient-to-br from-secondary to-primary text-white" : "bg-secondary text-secondary-foreground"
            )}>
              {isSuper ? "SA" : "AD"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{isSuper ? "Super Admin" : "Admin Demo"}</p>
              <p className="text-[10px] text-sidebar-foreground/50 truncate">{isSuper ? "superadmin@effe.pe" : "admin@effe.pe"}</p>
            </div>
          </div>
          <Button
            type="button"
            onClick={handleLogout}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
          >
            <LogOut size={14} /> Cerrar sesión
          </Button>
        </div>
      </aside>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="sticky top-0 z-30 h-14 lg:h-16 flex items-center bg-card/95 backdrop-blur-md border-b px-4 lg:px-8 gap-3">
          <Link to="/" className="lg:hidden flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-md flex items-center justify-center text-sm font-extrabold shadow-sm",
              isSuper ? "bg-gradient-to-br from-secondary to-primary text-white" : "gradient-secondary text-secondary-foreground"
            )}>
              eF
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold text-secondary uppercase tracking-widest text-[11px]">{isSuper ? "Super Admin" : "Admin"}</span>
            {breadcrumb?.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5"><ChevronRight size={12} /> {b}</span>
            ))}
          </div>
          <div className="lg:hidden flex-1 min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">{title}</h2>
            <p className="text-[10px] uppercase tracking-wider text-secondary font-bold leading-none">{isSuper ? "Super Admin" : "Admin"}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 lg:gap-4">
            <button className="hidden md:flex w-9 h-9 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground relative">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-secondary rounded-full" />
            </button>
            <span className="hidden md:inline text-sm text-muted-foreground">{isSuper ? "Super Admin" : "Admin Demo"}</span>
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm",
              isSuper ? "bg-gradient-to-br from-secondary to-primary text-white" : "bg-secondary text-secondary-foreground"
            )}>
              {isSuper ? "SA" : "AD"}
            </div>
            <AdminHamburger role={role} menu={menu} />
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-8 pb-24 lg:pb-8 bg-background">
          <div className="w-full space-y-5 md:space-y-6 animate-fade-in">
            <div className="hidden lg:block">
              <h1 className="text-2xl xl:text-3xl font-extrabold text-foreground tracking-tight">{title}</h1>
            </div>
            {children}
          </div>
        </main>
      </div>

      <AdminBottomNav role={role} can={can} />
    </div>
  );
}

// Título y breadcrumb por sub-ruta (lo que va después de /dashboard/{role}).
const ADMIN_META: Record<string, { title: string; breadcrumb: string[] }> = {
  "": { title: "Panel de control", breadcrumb: ["Dashboard"] },
  avisos: { title: "Gestión de avisos", breadcrumb: ["Operación", "Avisos"] },
  usuarios: { title: "Gestión de usuarios", breadcrumb: ["Operación", "Usuarios"] },
  comercial: { title: "Configuración comercial", breadcrumb: ["Operación", "Comercial"] },
  tarifas: { title: "Tarifas y Descuentos", breadcrumb: ["Operación", "Tarifas y Descuentos"] },
  conversaciones: { title: "Denuncias / Moderación", breadcrumb: ["Operación", "Denuncias"] },
  reportes: { title: "Reportes", breadcrumb: ["Operación", "Reportes"] },
  comunicaciones: { title: "Comunicaciones", breadcrumb: ["Comunicaciones", "Centro"] },
  roles: { title: "Roles y permisos", breadcrumb: ["Plataforma", "Roles"] },
  auditoria: { title: "Auditoría y registros", breadcrumb: ["Plataforma", "Auditoría"] },
};

// Shell PERSISTENTE del panel: el sidebar/header se montan una sola vez y solo
// cambia el contenido (<Outlet/>). Evita el parpadeo del navbar al navegar.
export function AdminShell() {
  const { pathname } = useLocation();
  const role: AdminRole = pathname.startsWith("/dashboard/superadmin") ? "superadmin" : "admin";
  const sub = pathname.replace(`/dashboard/${role}`, "").replace(/^\//, "");
  const meta = ADMIN_META[sub] ?? { title: "Administración", breadcrumb: [] };

  // Enforcement de la matriz de permisos: solo aplica al rol admin (el superadmin
  // define la matriz y no está sujeto a ella).
  const { can, ready } = usePermissions(role === "admin");
  const mod = MODULE_BY_SUB[sub];
  // Acceso directo por URL a un módulo sin can_view -> lo mandamos al dashboard.
  if (role === "admin" && ready && mod && !can(mod, "view")) {
    return <Navigate to={`/dashboard/${role}`} replace />;
  }

  return (
    <AdminLayout role={role} title={meta.title} breadcrumb={meta.breadcrumb} can={can}>
      <Suspense
        fallback={
          <div className="py-20 flex justify-center">
            <div className="w-8 h-8 rounded-full border-[3px] border-muted border-t-secondary animate-spin" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </AdminLayout>
  );
}

function AdminBottomNav({ role, can }: { role: AdminRole; can?: Can }) {
  const { pathname } = useLocation();
  const items = primaryMobile(role).filter((m) => (can ? can(m.module, "view") : true));
  const home = `/dashboard/${role}`;
  const isActive = (url: string) => (url === home ? pathname === url : pathname.startsWith(url));
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-primary text-primary-foreground border-t border-primary/40 shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.25)]">
      <div className="grid grid-cols-5 h-16">
        {items.map((item) => {
          const active = isActive(item.url);
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[10px] font-semibold relative",
                active ? "text-secondary" : "text-primary-foreground/60 hover:text-primary-foreground"
              )}
            >
              {active && <span className="absolute top-0 h-1 w-12 bg-secondary rounded-b-full" />}
              <item.icon size={active ? 22 : 20} strokeWidth={active ? 2.5 : 2} />
              <span className="truncate max-w-[64px]">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AdminHamburger({ role, menu }: { role: AdminRole; menu: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const primarySet = new Set(primaryMobile(role).map((i) => i.url));
  const overflow = menu.filter((m) => !primarySet.has(m.url));
  const isSuper = role === "superadmin";
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-label="Menú"
          className="lg:hidden w-9 h-9 flex items-center justify-center rounded-md bg-primary/5 hover:bg-primary/10 text-primary"
        >
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 p-0 bg-sidebar text-sidebar-foreground border-l-0">
        <SheetHeader className="p-5 border-b border-sidebar-border/40 text-left">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center font-extrabold",
              isSuper ? "bg-gradient-to-br from-secondary to-primary text-white" : "gradient-secondary text-secondary-foreground"
            )}>eF</div>
            <div>
              <SheetTitle className="text-sidebar-foreground text-sm">
                eFFe<span className="text-sidebar-primary"> Multi</span>
              </SheetTitle>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
                {isSuper ? "Super Admin" : "Administración"}
              </p>
            </div>
          </div>
        </SheetHeader>
        <div className="p-3 flex flex-col gap-0.5 overflow-y-auto h-full pb-20">
          <p className="px-3 py-2 text-[10px] uppercase tracking-widest font-semibold text-sidebar-foreground/40">Más opciones</p>
          {overflow.map((item) => {
            const active = pathname.startsWith(item.url);
            return (
              <Link
                key={item.url}
                to={item.url}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium",
                  active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                )}
              >
                <item.icon size={18} />
                <span className="flex-1">{item.title}</span>
              </Link>
            );
          })}
          <div className="border-t border-sidebar-border/40 my-3" />
          <button
            type="button"
            onClick={() => { setOpen(false); handleLogout(); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-secondary hover:bg-secondary/10"
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
