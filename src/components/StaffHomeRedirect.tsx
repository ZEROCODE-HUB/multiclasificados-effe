import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession, isStaffRole } from "@/hooks/useSession";
import { landingPath } from "@/lib/auth";

// Un miembro del staff YA logueado que abre la portada "/" va directo a su panel,
// en vez de navegar el sitio como si fuera un usuario. Se aplica SOLO a "/": el
// staff todavía puede abrir un /aviso/:id compartido, usar /buscar, /pay, etc.
// El destino (landingPath → /dashboard/{admin|superadmin}) está protegido por
// RequireRole, así que no hay riesgo de bucle.
export function StaffHomeRedirect({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session?.supabase && isStaffRole(session.role)) {
    return <Navigate to={landingPath(session)} replace />;
  }
  return <>{children}</>;
}
