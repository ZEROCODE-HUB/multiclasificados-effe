import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
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
  ChevronLeft,
} from "lucide-react";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Publicar aviso", url: "/dashboard/publicar", icon: PlusCircle },
  { title: "Mis avisos", url: "/dashboard/avisos", icon: ClipboardList },
  { title: "Mensajes", url: "/dashboard/mensajes", icon: MessageSquare },
  { title: "Postulaciones", url: "/dashboard/postulaciones", icon: Users },
  { title: "Configuración", url: "/dashboard/configuracion", icon: Settings },
];

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

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
          <SidebarGroupLabel className="text-sidebar-foreground/50">Menú principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/dashboard"}
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
                <Link to="/" className="text-sidebar-foreground/60 hover:text-sidebar-foreground">
                  <LogOut className="mr-2 h-4 w-4" />
                  {!collapsed && <span>Cerrar sesión</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-4">
            <SidebarTrigger />
            <span className="text-sm font-medium text-muted-foreground">Panel de Anunciante</span>
            <div className="ml-auto flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground text-sm font-bold">
                JM
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 bg-background">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
