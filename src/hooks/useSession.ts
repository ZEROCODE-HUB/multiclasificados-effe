import { useEffect, useState } from "react";

export type SessionRole = "anunciante" | "buscador" | "soporte" | "moderador" | "admin" | "superadmin";

export interface Session {
  role: SessionRole;
  name: string;
  initials: string;
  /** Correo del usuario (solo en sesión real de Supabase). */
  email?: string;
  /** true cuando la sesión proviene de Supabase (no de los botones demo). */
  supabase?: boolean;
}

// Roles de staff (personal de la plataforma). Se usan para dos cosas opuestas:
// darles el panel admin y NEGARLES los paneles de usuario.
// Moderador y soporte también son personal: entran al panel, y lo que ven dentro
// lo decide la Matriz de permisos (role_permissions), no este listado.
const STAFF: SessionRole[] = ["admin", "superadmin", "moderador", "soporte"];

export function isStaffRole(role: SessionRole | undefined | null): boolean {
  return !!role && STAFF.includes(role);
}

const KEY = "effe_session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    // Solo son válidas las sesiones reales de Supabase. Cualquier sesión local
    // sin este flag es un resto heredado (p.ej. una sesión demo antigua
    // "Juan Mendoza"/"Ana García" de versiones previas) y se descarta —y se
    // borra— para no mostrar identidades ni datos falsos.
    if (!s?.supabase) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

// Guarda una sesión completa (usado por la autenticación real de Supabase).
export function setSessionData(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("effe-session"));
  return s;
}

export function clearSession() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("effe-session"));
}

function sameSession(a: Session | null, b: Session | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.role === b.role && a.name === b.name && a.initials === b.initials && a.email === b.email;
}

export function useSession(): Session | null {
  const [session, setSessionState] = useState<Session | null>(() => getSession());

  useEffect(() => {
    const sync = () => {
      const next = getSession();
      setSessionState((prev) => (sameSession(prev, next) ? prev : next));
    };
    window.addEventListener("effe-session", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("effe-session", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return session;
}
