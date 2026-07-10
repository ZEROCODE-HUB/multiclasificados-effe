import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Wrench } from "lucide-react";
import { fetchMaintenanceMode } from "@/lib/maintenance";
import { useSession, isStaffRole } from "@/hooks/useSession";

/**
 * Modo mantenimiento: con el interruptor de "Variables del sistema" encendido,
 * la plataforma queda cerrada y se muestra una pantalla informativa.
 *
 * Dos excepciones, y ninguna es un descuido:
 *   - El staff entra igual. Si no, nadie podría apagar el interruptor desde el
 *     panel y habría que volver a abrir la app desde la base de datos.
 *   - `/auth/staff` y `/auth/callback` quedan accesibles: un administrador que
 *     no tenga la sesión iniciada necesita poder llegar al formulario de login.
 *     El login de usuario normal (`/auth`) sí queda bloqueado.
 */

const RUTAS_PERMITIDAS = ["/auth/staff", "/auth/callback"];

export function MaintenanceScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-secondary/15 text-secondary flex items-center justify-center mx-auto">
          <Wrench size={28} />
        </div>
        <h1 className="text-2xl font-extrabold text-foreground">La aplicación está en mantenimiento</h1>
        <p className="text-sm text-muted-foreground">
          Estamos realizando tareas de mejora. Vuelve más tarde, por favor.
        </p>
      </div>
    </div>
  );
}

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const [enMantenimiento, setEnMantenimiento] = useState<boolean | null>(null);
  const session = useSession();
  const { pathname } = useLocation();

  useEffect(() => {
    let vigente = true;
    fetchMaintenanceMode().then((v) => vigente && setEnMantenimiento(v));
    return () => { vigente = false; };
  }, []);

  // Mientras se comprueba no se pinta la app: si no, el usuario vería la
  // portada un instante antes de que le cerraran la puerta.
  if (enMantenimiento === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-9 h-9 rounded-full border-[3px] border-muted border-t-secondary animate-spin" />
      </div>
    );
  }

  if (!enMantenimiento) return <>{children}</>;
  if (isStaffRole(session?.role)) return <>{children}</>;
  if (RUTAS_PERMITIDAS.includes(pathname)) return <>{children}</>;

  return <MaintenanceScreen />;
}
