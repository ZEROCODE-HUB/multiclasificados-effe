import { useEffect, useState } from "react";

export type SessionRole = "anunciante" | "buscador" | "admin" | "superadmin";

export interface Session {
  role: SessionRole;
  name: string;
  initials: string;
  /** Correo del usuario (solo en sesión real de Supabase). */
  email?: string;
  /** true cuando la sesión proviene de Supabase (no de los botones demo). */
  supabase?: boolean;
}

const KEY = "effe_session";

const defaultsByRole: Record<SessionRole, { name: string; initials: string }> = {
  anunciante: { name: "Juan Mendoza", initials: "JM" },
  buscador: { name: "Ana García", initials: "AG" },
  admin: { name: "Admin eFFe", initials: "AE" },
  superadmin: { name: "Super Admin", initials: "SA" },
};

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(role: SessionRole) {
  const s: Session = { role, ...defaultsByRole[role] };
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event("effe-session"));
  return s;
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
