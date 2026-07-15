import { useLocation } from "react-router-dom";
import { Navbar } from "@/components/Navbar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  role: "anunciante" | "buscador";
  /** El hijo ocupa la altura libre exacta y hace su propio scroll interno, en
   *  vez de estirar la página (chat). Solo en escritorio: en móvil el chat ya
   *  se posiciona fijo entre las dos barras. */
  fullHeight?: boolean;
}

const titlesByPath: Record<string, string> = {
  "/dashboard/anunciante": "Panel y estadísticas",
  "/dashboard/anunciante/publicar": "Publicar aviso",
  "/dashboard/anunciante/avisos": "Mis avisos",
  "/dashboard/anunciante/mensajes": "Mensajes",
  "/dashboard/anunciante/postulaciones": "Postulaciones",
  "/dashboard/anunciante/estadisticas": "Panel y estadísticas",
  "/dashboard/anunciante/configuracion": "Configuración",
  "/dashboard/anunciante/boletas": "Mis comprobantes",
  "/dashboard/buscador": "Panel y estadísticas",
  "/dashboard/buscador/favoritos": "Favoritos",
  "/dashboard/buscador/busquedas": "Búsquedas guardadas",
  "/dashboard/buscador/mensajes": "Mensajes",
  "/dashboard/buscador/configuracion": "Configuración",
};

export function DashboardLayout({ children, fullHeight = false }: DashboardLayoutProps) {
  const { pathname } = useLocation();
  const title = titlesByPath[pathname] ?? "Mi cuenta";

  return (
    <div className={`min-h-screen flex flex-col w-full bg-background ${fullHeight ? "lg:h-screen lg:overflow-hidden" : ""}`}>
      <Navbar />

      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-7xl w-full px-3 md:px-6 lg:px-8 py-3">
          <p className="text-[10px] uppercase tracking-widest text-secondary font-bold">Mi cuenta</p>
          <h1 className="text-lg md:text-xl font-bold text-foreground leading-tight">{title}</h1>
        </div>
      </div>

      <main
        className={`flex-1 px-3 sm:px-6 lg:px-8 py-4 md:py-6 lg:py-8 pb-24 lg:pb-12 ${
          fullHeight ? "lg:flex lg:flex-col lg:min-h-0" : ""
        }`}
      >
        <div className={`mx-auto max-w-7xl w-full ${fullHeight ? "lg:flex lg:flex-col lg:flex-1 lg:min-h-0" : ""}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
