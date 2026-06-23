// Guarda de ruta por rol real (jerarquía de permisos).
// - Sin sesión  -> redirige a /auth recordando el destino.
// - Área de staff sin login real de Supabase -> también va a /auth.
// - Sesión con rol insuficiente -> pantalla "Acceso denegado".
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession, type SessionRole } from "@/hooks/useSession";

// Jerarquía: superadmin > admin > (anunciante/buscador).
const RANK: Record<SessionRole, number> = {
  buscador: 0,
  anunciante: 0,
  admin: 2,
  superadmin: 3,
};

function AccessDenied({ role }: { role: SessionRole }) {
  // Panel destino según el rol actual del usuario.
  const home =
    role === "superadmin" ? "/dashboard/superadmin"
    : role === "admin" ? "/dashboard/admin"
    : role === "anunciante" ? "/dashboard/anunciante"
    : "/dashboard/buscador";
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="max-w-md w-full text-center bg-card border rounded-2xl p-8 shadow-sm">
        <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={26} />
        </div>
        <h1 className="text-xl font-extrabold text-foreground">Acceso denegado</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Tu cuenta no tiene permisos para esta sección. Si crees que es un error,
          contacta al superadministrador.
        </p>
        <div className="flex gap-2 justify-center mt-6">
          <Link to={home}><Button variant="outline">Ir a mi panel</Button></Link>
          <Link to="/"><Button>Inicio</Button></Link>
        </div>
      </div>
    </div>
  );
}

interface Props {
  /** Rol mínimo requerido (jerarquía). */
  min: SessionRole;
  /** Exige que la sesión provenga de un login real de Supabase (no demo). */
  requireReal?: boolean;
  children: React.ReactNode;
}

export function RequireRole({ min, requireReal = true, children }: Props) {
  const session = useSession();
  const location = useLocation();
  const loginUrl = `/auth?redirect=${encodeURIComponent(location.pathname)}`;

  if (!session) return <Navigate to={loginUrl} replace />;
  if (requireReal && !session.supabase) return <Navigate to={loginUrl} replace />;
  if (RANK[session.role] < RANK[min]) return <AccessDenied role={session.role} />;

  return <>{children}</>;
}
