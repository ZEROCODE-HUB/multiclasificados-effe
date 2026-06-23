// Capa de autenticación real (Supabase) que alimenta el contrato existente
// de useSession ({ role, name, initials }) para NO romper el diseño actual.
import { supabase } from "@/lib/supabase";
import { clearSession, setSessionData, type Session, type SessionRole } from "@/hooks/useSession";

// Prioridad de rol cuando un usuario tiene varios (para elegir el panel destino).
const ROLE_PRIORITY: SessionRole[] = ["superadmin", "admin", "anunciante", "buscador"];

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// Lee el usuario actual de Supabase + perfil + roles y lo refleja en la
// sesión local (localStorage) que consume toda la app.
export async function syncSession(): Promise<Session | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("full_name, initials").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const roleSet = new Set((roles ?? []).map((r: { role: SessionRole }) => r.role));
  const role = ROLE_PRIORITY.find((r) => roleSet.has(r)) ?? "buscador";

  const name =
    profile?.full_name ||
    (user.user_metadata?.full_name as string) ||
    user.email ||
    "Usuario";
  const initials = profile?.initials || initialsFrom(name);

  return setSessionData({ role, name, initials, supabase: true });
}

// Destino tras iniciar sesión: el staff aterriza directo en su panel; el resto
// donde haya pedido ir (redirect) o al inicio. Centralizado para usarlo igual
// en login con contraseña y en el callback de Google.
export function landingPath(session: Session | null, redirect?: string | null): string {
  if (redirect) return redirect;
  if (session && (session.role === "admin" || session.role === "superadmin")) {
    return `/dashboard/${session.role}`;
  }
  return "/";
}

export async function signInWithPassword(email: string, password: string): Promise<Session | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return syncSession();
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export async function signUpWithPassword(input: SignUpInput): Promise<Session | null> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName, phone: input.phone } },
  });
  if (error) throw error;
  // Si la confirmación por email está activada, no habrá sesión todavía.
  if (!data.session) return null;
  if (input.phone) {
    await supabase.from("profiles").update({ phone: input.phone }).eq("id", data.user!.id);
  }
  return syncSession();
}

// Inicia el flujo OAuth de Google. Redirige el navegador a Google y vuelve a /auth/callback.
export async function signInWithGoogle(redirect?: string): Promise<void> {
  const redirectTo = `${window.location.origin}/auth/callback${
    redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""
  }`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  clearSession();
}
