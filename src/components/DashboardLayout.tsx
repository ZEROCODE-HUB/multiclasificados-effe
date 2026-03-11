import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
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
} from "lucide-react";

const advertiserMenu = [
  { title: "Dashboard", url: "/dashboard/anunciante", icon: LayoutDashboard },
  { title: "Publicar aviso", url: "/dashboard/anunciante/publicar", icon: PlusCircle },
  { title: "Mis avisos", url: "/dashboard/anunciante/avisos", icon: ClipboardList },
  { title: "Mensajes", url: "/dashboard/anunciante/mensajes", icon: MessageSquare },
  { title: "Postulaciones", url: "/dashboard/anunciante/postulaciones", icon: Users },
  { title: "Estadísticas", url: "/dashboard/anunciante/estadisticas", icon: BarChart3 },
  { title: "Configuración", url: "/dashboard/anunciante/configuracion", icon: Settings },
];

const seekerMenu = [
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

function AppSidebar({ role }: { role: "anunciante" | "buscador" }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const menuItems = role === "anunciante" ? advertiserMenu : seekerMenu;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-sidebar">
        <div className="p-4">
          <Link to="/" className="flex items-center gap-2">
            {!collapsed && (
              <span className="text-lg font-extrabold text-sidebar-foreground">
                eFFe<span className="text-sidebar-primary"> Multi</span>
              </span>
            )}
            {collapsed && <span className="text-lg font-extrabold text-sidebar-primary">eF</span>}
          </Link>
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">
            {role === "anunciante" ? "Panel Anunciante" : "Panel Buscador"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === `/dashboard/${role}`}
                      className="text-sidebar-foreground/80 hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="mt-auto p-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/auth" className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                  <LogOut className="mr-2 h-4 w-4" />
                  {!collapsed && <span>Cambiar rol</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const isAdvertiser = role === "anunciante";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar role={role} />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">
              {isAdvertiser ? "Panel de Anunciante" : "Panel de Buscador"}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-muted-foreground hidden md:inline">
                {isAdvertiser ? "Juan Mendoza" : "Ana García"}
              </span>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isAdvertiser ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"}`}>
                {isAdvertiser ? "JM" : "AG"}
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 bg-background">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
