// Capa de autenticación real (Supabase) que alimenta el contrato existente
// de useSession ({ role, name, initials }) para NO romper el diseño actual.
import { supabase } from "@/lib/supabase";
import { savePushToken } from "@/lib/push";
import { clearSession, isStaffRole, setSessionData, type Session, type SessionRole } from "@/hooks/useSession";

// Prioridad de rol cuando un usuario tiene varios (para elegir el panel destino).
const ROLE_PRIORITY: SessionRole[] = ["superadmin", "admin", "moderador", "soporte", "anunciante", "buscador"];

// Roles de staff (personal): NO pueden iniciar sesión por el login de usuario
// (/auth); deben usar el login de staff (/auth/staff).
const STAFF_ROLES: SessionRole[] = ["admin", "superadmin", "moderador", "soporte"];

// Mensaje genérico e indistinguible de una contraseña equivocada: no revela que
// la cuenta existe ni que es de staff.
export const INVALID_CREDENTIALS_MSG = "Correo o contraseña incorrectos.";

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

  return setSessionData({ role, name, initials, email: user.email ?? undefined, supabase: true });
}

// Perfil propio del usuario logueado (para su panel de Configuración).
export interface MyProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  verified: boolean;
  status: string;
  company_name: string;
  company_ruc: string;
  avatar_url: string;
}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  // Usamos la sesión local (getSession) en vez de getUser(): getUser hace una
  // llamada de red para revalidar el token que, con la sesión OAuth de Google,
  // a veces falla y dejaba el formulario de Configuración vacío pese a estar
  // logueado. getSession lee la sesión ya validada (misma fuente que syncSession).
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name, phone, verified, status, email, company_name, company_ruc, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  return {
    id: user.id,
    full_name: data?.full_name ?? (user.user_metadata?.full_name as string) ?? "",
    email: data?.email ?? user.email ?? "",
    phone: data?.phone ?? "",
    verified: !!data?.verified,
    status: data?.status ?? "active",
    company_name: data?.company_name ?? "",
    company_ruc: data?.company_ruc ?? "",
    avatar_url: data?.avatar_url ?? "",
  };
}

// Actualiza datos del propio perfil (RLS: profiles_update_own).
export async function updateMyProfile(patch: {
  full_name?: string; phone?: string; company_name?: string; company_ruc?: string; avatar_url?: string;
}): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("No hay sesión activa.");
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) throw error;
}

// Sube la foto de perfil al bucket `avatars` (carpeta = uid del dueño; RLS lo
// exige) y guarda la URL pública en el perfil. Devuelve la URL con cache-bust
// para que la nueva imagen se vea de inmediato en toda la app.
export async function uploadMyAvatar(file: File): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("No hay sesión activa.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${user.id}/avatar.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = `${pub.publicUrl}?t=${Date.now()}`;
  await updateMyProfile({ avatar_url: url });
  return url;
}

// Destino tras iniciar sesión: el staff aterriza en su panel; el resto donde
// haya pedido ir (redirect) o al inicio. Centralizado para usarlo igual en el
// login con contraseña y en el callback de Google.
//
// El `redirect` del staff solo se respeta si apunta a su propia área: si no, un
// admin que llega desde una ruta de usuario (p. ej.
// /auth/staff?redirect=/dashboard/buscador) aterrizaría en el panel de usuario.
export function landingPath(session: Session | null, redirect?: string | null): string {
  if (session && isStaffRole(session.role)) {
    // Moderador y soporte no tienen panel propio: operan el de administración,
    // recortado por la Matriz de permisos. `/dashboard/moderador` no existe.
    const staffHome = session.role === "superadmin" ? "/dashboard/superadmin" : "/dashboard/admin";
    return redirect && isStaffPath(redirect) ? redirect : staffHome;
  }
  if (redirect) return redirect;
  return "/";
}

// ¿La ruta pertenece al área de staff? Se compara contra el prefijo del panel
// para no confundir `/dashboard/admin...` con `/dashboard/administrador-x`.
function isStaffPath(path: string): boolean {
  return ["/dashboard/admin", "/dashboard/superadmin"].some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

// Mientras se comprueba el rol de una cuenta recién autenticada (y que por tanto
// todavía puede ser rechazada), el puente de auth (SupabaseAuthBridge) NO debe
// sincronizar la sesión: si lo hiciera, la persistiría por un instante y
// dispararía la redirección ANTES de que alcancemos a cerrarla. Esta bandera se
// lo indica.
let blockingStaffLogin = false;
export function isBlockingStaffLogin(): boolean {
  return blockingStaffLogin;
}

// ¿La cuenta tiene rol de staff? `null` = no se pudo averiguar (red caída, RLS,
// timeout). Quien llama trata el `null` como motivo de rechazo, en las dos
// direcciones: asumir cualquier cosa abriría justo el agujero que esto cierra.
async function fetchIsStaff(userId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error || !data) return null;
  return data.some((r: { role: SessionRole }) => STAFF_ROLES.includes(r.role));
}

/**
 * Las dos puertas de entrada son excluyentes y cada una vigila su lado:
 *  - `rejectStaff`  → /auth: el personal NO entra por el login de usuario.
 *  - `requireStaff` → /auth/staff: un usuario normal NO entra por el de admin.
 * En ambos casos la cuenta rechazada recibe el MISMO mensaje que una contraseña
 * equivocada, y su sesión se cierra antes de persistirla.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  opts?: { rejectStaff?: boolean; requireStaff?: boolean },
): Promise<Session | null> {
  const checksRole = !!(opts?.rejectStaff || opts?.requireStaff);
  // Se activa ANTES de autenticar: el evento SIGNED_IN se dispara durante la
  // propia llamada, así que el puente ya debe estar silenciado.
  if (checksRole) blockingStaffLogin = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (checksRole) {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const isStaff = userId ? await fetchIsStaff(userId) : null;

      // Falla CERRADA: con `isStaff === null` (rol desconocido) se rechaza siempre.
      const rejected = opts?.requireStaff ? isStaff !== true : isStaff !== false;
      if (rejected) {
        await supabase.auth.signOut();
        clearSession();
        throw new Error(INVALID_CREDENTIALS_MSG);
      }
    }

    // syncSession() también valida la cuenta: lanza AccountBlockedError si está
    // baneada o suspendida.
    const session = await syncSession();

    // Como el puente quedó silenciado durante todo el SIGNED_IN (ver
    // `blockingStaffLogin`), aquí recuperamos lo que él habría hecho: asociar el
    // token de push de este dispositivo. Sin esto, en el APK nadie que entre con
    // correo y contraseña vuelve a recibir notificaciones.
    //
    // El orden importa; va al final, ya con la sesión validada:
    //  - después de la comprobación de rol, o dejaríamos el teléfono asociado a
    //    la cuenta que acabamos de rechazar y le llegarían aquí SUS push;
    //  - después de syncSession(), o un usuario baneado registraría su
    //    dispositivo justo antes de que lo echemos, y seguiría recibiendo push.
    if (checksRole) savePushToken();

    return session;
  } finally {
    blockingStaffLogin = false;
  }
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
