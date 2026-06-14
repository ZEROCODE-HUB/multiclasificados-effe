import { useLocation } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { MobileBottomNav } from "@/components/MobileBottomNav";

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: "anunciante" | "buscador";
}

const titlesByPath: Record<string, string> = {
  "/dashboard/anunciante": "Panel de anunciante",
  "/dashboard/anunciante/publicar": "Publicar aviso",
  "/dashboard/anunciante/avisos": "Mis avisos",
  "/dashboard/anunciante/mensajes": "Mensajes",
  "/dashboard/anunciante/postulaciones": "Postulaciones",
  "/dashboard/anunciante/estadisticas": "Estadísticas",
  "/dashboard/anunciante/configuracion": "Configuración",
  "/dashboard/buscador": "Panel de buscador",
  "/dashboard/buscador/buscar": "Buscar avisos",
  "/dashboard/buscador/favoritos": "Favoritos",
  "/dashboard/buscador/busquedas": "Búsquedas guardadas",
  "/dashboard/buscador/mensajes": "Mensajes",
  "/dashboard/buscador/alertas": "Alertas",
  "/dashboard/buscador/configuracion": "Configuración",
};

export function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const title = titlesByPath[pathname] ?? (role === "anunciante" ? "Panel de anunciante" : "Panel de buscador");
  const isHome = pathname === `/dashboard/${role}`;

  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <Navbar />

      {!isHome && (
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 md:px-6 lg:px-8 py-3">
            <p className="text-[10px] uppercase tracking-widest text-secondary font-bold">
              {role === "anunciante" ? "Anunciante" : "Buscador"}
            </p>
            <h1 className="text-lg md:text-xl font-bold text-foreground leading-tight">{title}</h1>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 lg:py-8 pb-24 lg:pb-12">
        <div className="container mx-auto max-w-7xl">{children}</div>
      </main>

      <MobileBottomNav role={role} />
    </div>
  );
}
