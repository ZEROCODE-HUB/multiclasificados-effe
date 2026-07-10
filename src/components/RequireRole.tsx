// Guarda de ruta por rol real (jerarquía de permisos).
// - Sin sesión  -> redirige al login recordando el destino.
//     · Área de staff (admin/superadmin) -> /auth/staff (login CON hCaptcha).
//     · Resto -> /auth (login sin captcha).
// - Sesión con rol insuficiente -> pantalla "Acceso denegado".
// - Staff en un área de usuario -> "Acceso denegado" (la jerarquía NO se hereda
//   hacia abajo: el admin administra la plataforma, no opera como usuario).
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession, isStaffRole, type SessionRole } from "@/hooks/useSession";
import { getMfaState } from "@/lib/mfa";
import { MfaGate } from "@/components/MfaGate";

// Jerarquía: superadmin > admin > (moderador/soporte) > (anunciante/buscador).
// Moderador y soporte comparten rango: entrar al panel es lo mismo para ambos,
// y lo que puede hacer cada uno dentro lo decide la Matriz de permisos.
const RANK: Record<SessionRole, number> = {
  buscador: 0,
  anunciante: 0,
  soporte: 1,
  moderador: 1,
  admin: 2,
  superadmin: 3,
};

// Roles que definen "área de staff" cuando se piden como mínimo.
const STAFF_MIN: SessionRole[] = ["soporte", "moderador", "admin", "superadmin"];

function AccessDenied({ role, staffInUserArea = false }: { role: SessionRole; staffInUserArea?: boolean }) {
  // Panel destino según el rol actual del usuario.
  const home =
    role === "superadmin" ? "/dashboard/superadmin"
    : role === "admin" || role === "moderador" || role === "soporte" ? "/dashboard/admin"
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
          {staffInUserArea
            ? "Las cuentas de administración no pueden usar los paneles de usuario. Usa tu panel de administración."
            : "Tu cuenta no tiene permisos para esta sección. Si crees que es un error, contacta al superadministrador."}
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

  // El staff DEBE tener 2FA completado (AAL2) para entrar al panel.
  const isStaffArea = STAFF_MIN.includes(min);

  // El staff va al login CON hCaptcha (/auth/staff); el usuario normal al login
  // sin captcha (/auth). Así el captcha aparece solo en el acceso de admin.
  const loginUrl = `${isStaffArea ? "/auth/staff" : "/auth"}?redirect=${encodeURIComponent(location.pathname)}`;
  const [mfaOk, setMfaOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isStaffArea || !session?.supabase) { setMfaOk(true); return; }
    let active = true;
    getMfaState().then((m) => active && setMfaOk(m.currentLevel === "aal2"));
    return () => { active = false; };
  }, [isStaffArea, session?.supabase, session?.role]);

  if (!session) return <Navigate to={loginUrl} replace />;
  if (requireReal && !session.supabase) return <Navigate to={loginUrl} replace />;

  // El staff NO entra a los paneles de usuario. La jerarquía RANK solo sirve
  // para exigir un rol MÍNIMO en el área de staff; hacia abajo no se hereda
  // (si no, admin(2) >= buscador(0) le abriría todo el panel de usuario).
  if (!isStaffArea && isStaffRole(session.role)) {
    return <AccessDenied role={session.role} staffInUserArea />;
  }

  if (RANK[session.role] < RANK[min]) return <AccessDenied role={session.role} />;

  if (isStaffArea) {
    if (mfaOk === null) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30">
          <Loader2 className="animate-spin text-secondary" size={28} />
        </div>
      );
    }
    if (!mfaOk) return <MfaGate onVerified={() => setMfaOk(true)} />;
  }

  return <>{children}</>;
}
