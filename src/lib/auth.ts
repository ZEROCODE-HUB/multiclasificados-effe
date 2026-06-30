// Capa de autenticación real (Supabase) que alimenta el contrato existente
// de useSession ({ role, name, initials }) para NO romper el diseño actual.
import { supabase } from "@/lib/supabase";
import { clearSession, setSessionData, type Session, type SessionRole } from "@/hooks/useSession";

// Prioridad de rol cuando un usuario tiene varios (para elegir el panel destino).
const ROLE_PRIORITY: SessionRole[] = ["superadmin", "admin", "anunciante", "buscador"];

// Error cuando la cuenta está suspendida o baneada: se cierra la sesión y se
// muestra el motivo en el login.
export class AccountBlockedError extends Error {
  status: "suspended" | "banned";
  constructor(status: "suspended" | "banned") {
    super(
      status === "banned"
        ? "Tu cuenta ha sido baneada permanentemente. Si crees que es un error, contacta al soporte."
        : "Tu cuenta está suspendida temporalmente. Contacta al soporte para más información.",
    );
    this.name = "AccountBlockedError";
    this.status = status;
  }
}

// ¿El estado del perfil impide el acceso? Suspensión con fecha pasada ya no bloquea.
function isBlocked(status?: string | null, suspendedUntil?: string | null): false | "suspended" | "banned" {
  if (status === "banned") return "banned";
  if (status === "suspended") {
    const until = suspendedUntil ? new Date(suspendedUntil).getTime() : null;
    if (until === null || until > Date.now()) return "suspended";
  }
  return false;
}

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
    supabase.from("profiles").select("full_name, initials, status, suspended_until").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  // Bloqueo de acceso: si está suspendido/baneado, cerramos sesión y avisamos.
  const blocked = isBlocked(profile?.status, profile?.suspended_until);
  if (blocked) {
    await supabase.auth.signOut();
    clearSession();
    throw new AccountBlockedError(blocked);
  }

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

// Perfil propio del usuario logueado (para su panel de Configuración).
export interface MyProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  verified: boolean;
  status: string;
}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name, phone, verified, status, email")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    full_name: data?.full_name ?? (user.user_metadata?.full_name as string) ?? "",
    email: data?.email ?? user.email ?? "",
    phone: data?.phone ?? "",
    verified: !!data?.verified,
    status: data?.status ?? "active",
  };
}

// Actualiza nombre y teléfono del propio perfil (RLS: profiles_update_own).
export async function updateMyProfile(patch: { full_name?: string; phone?: string }): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión activa.");
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) throw error;
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
  fullName?: string;
  phone?: string;
}

export async function signUpWithPassword(input: SignUpInput): Promise<Session | null> {
  // Registro de baja fricción: si no se pide nombre, se deriva del correo.
  const fullName = input.fullName?.trim() || input.email.split("@")[0];
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: fullName, phone: input.phone } },
  });
  if (error) throw error;
  // Si la confirmación por email está activada, no habrá sesión todavía.
  if (!data.session) return null;
  if (input.phone) {
    await supabase.from("profiles").update({ phone: input.phone }).eq("id", data.user!.id);
  }
  return syncSession();
}

// Deep link al que vuelve el OAuth en el APK (registrado en AndroidManifest).
export const NATIVE_OAUTH_REDIRECT = "com.effe.multiclasificados://auth-callback";

// Flujo OAuth unificado. En web redirige a /auth/callback; en el APK (Capacitor)
// abre el navegador del sistema y vuelve a la app por deep link (lo completa
// el listener `appUrlOpen` de nativeInit).
async function oauthSignIn(provider: "google" | "facebook", redirect?: string): Promise<void> {
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: NATIVE_OAUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (data?.url) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: data.url });
    }
    return;
  }
  const redirectTo = `${window.location.origin}/auth/callback${
    redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""
  }`;
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error) throw error;
}

export async function signInWithGoogle(redirect?: string): Promise<void> {
  return oauthSignIn("google", redirect);
}

export async function signInWithFacebook(redirect?: string): Promise<void> {
  return oauthSignIn("facebook", redirect);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  clearSession();
}
