import { describe, it, expect, vi, beforeEach } from "vitest";

// Datos controlables por test.
let rolesData: Array<{ role: string }> | null = [];
let rolesError: { message: string } | null = null;
const profileData = { full_name: "Usuario", initials: "US", status: "active", suspended_until: null };

const signInWithPasswordSb = vi.fn().mockResolvedValue({ error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1", email: "u@e.com" } } } });
const signOut = vi.fn().mockResolvedValue({});

// Query builder mínimo: encadenable, awaitable (roles) y con maybeSingle (perfil).
function query(table: string) {
  const p = Promise.resolve(
    table === "user_roles"
      ? { data: rolesData, error: rolesError }
      : { data: profileData, error: null },
  );
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    maybeSingle: () => Promise.resolve({ data: profileData }),
    then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) => p.then(f, r),
  };
  return b;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPasswordSb(...a),
      getSession: (...a: unknown[]) => getSession(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
    from: (t: string) => query(t),
  },
}));

const savePushToken = vi.fn();
vi.mock("@/lib/push", () => ({ savePushToken: () => savePushToken() }));

const setSessionData = vi.fn((s: unknown) => s);
const clearSession = vi.fn();
vi.mock("@/hooks/useSession", () => ({
  setSessionData: (s: unknown) => setSessionData(s),
  clearSession: () => clearSession(),
  // auth.ts también lo importa (landingPath); el mock debe proveerlo.
  isStaffRole: (r: string) => r === "admin" || r === "superadmin",
}));

import { signInWithPassword, INVALID_CREDENTIALS_MSG, isBlockingStaffLogin } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  rolesData = [];
  rolesError = null;
});

describe("signInWithPassword — el staff no entra por el login de usuario", () => {
  it("RECHAZA a un admin en el login de usuario (rejectStaff) con mensaje genérico y cierra la sesión", async () => {
    rolesData = [{ role: "admin" }];
    await expect(
      signInWithPassword("admin@e.com", "clave", { rejectStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    expect(signOut).toHaveBeenCalledTimes(1); // se deshace la sesión recién creada
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(setSessionData).not.toHaveBeenCalled(); // nunca se persiste → sin redirección
  });

  it("RECHAZA también a un superadmin en el login de usuario", async () => {
    rolesData = [{ role: "superadmin" }];
    await expect(
      signInWithPassword("super@e.com", "clave", { rejectStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    expect(setSessionData).not.toHaveBeenCalled();
  });

  it("PERMITE a un admin por el login de staff (sin rejectStaff)", async () => {
    rolesData = [{ role: "admin" }];
    const s = await signInWithPassword("admin@e.com", "clave", { rejectStaff: false });
    expect(signOut).not.toHaveBeenCalled();
    expect(setSessionData).toHaveBeenCalledTimes(1);
    expect(s?.role).toBe("admin");
  });

  it("PERMITE a un usuario normal por el login de usuario", async () => {
    rolesData = [{ role: "buscador" }];
    const s = await signInWithPassword("user@e.com", "clave", { rejectStaff: true });
    expect(signOut).not.toHaveBeenCalled();
    expect(setSessionData).toHaveBeenCalledTimes(1);
    expect(s?.role).toBe("buscador");
  });

  it("FALLA CERRADA: si no se pueden leer los roles, rechaza en vez de dejar pasar", async () => {
    rolesData = null;
    rolesError = { message: "network error" };
    await expect(
      signInWithPassword("admin@e.com", "clave", { rejectStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(setSessionData).not.toHaveBeenCalled();
  });

  it("FALLA CERRADA: si la consulta de roles devuelve null sin error, tampoco pasa", async () => {
    rolesData = null;
    await expect(
      signInWithPassword("admin@e.com", "clave", { rejectStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    expect(setSessionData).not.toHaveBeenCalled();
  });

  // El puente (SupabaseAuthBridge) queda silenciado durante todo el SIGNED_IN,
  // así que es signInWithPassword quien debe asociar el token de push. Sin esto,
  // en el APK nadie que entre con correo y contraseña recibe notificaciones.
  it("asocia el token de push del dispositivo tras un login de usuario válido", async () => {
    rolesData = [{ role: "buscador" }];
    await signInWithPassword("user@e.com", "clave", { rejectStaff: true });
    expect(savePushToken).toHaveBeenCalledTimes(1);
  });

  it("NO asocia el token de push al dispositivo si se rechaza a un admin", async () => {
    rolesData = [{ role: "admin" }];
    await expect(
      signInWithPassword("admin@e.com", "clave", { rejectStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    // Si se asociara, este teléfono recibiría los push del administrador.
    expect(savePushToken).not.toHaveBeenCalled();
  });

  it("en el login de staff el token lo asocia el puente, no signInWithPassword", async () => {
    rolesData = [{ role: "admin" }];
    await signInWithPassword("admin@e.com", "clave", { rejectStaff: false });
    // El puente no está silenciado en esta ruta: llamarlo aquí lo duplicaría.
    expect(savePushToken).not.toHaveBeenCalled();
  });

  it("silencia el puente de auth DURANTE el login y lo reactiva al terminar", async () => {
    rolesData = [{ role: "admin" }];
    expect(isBlockingStaffLogin()).toBe(false);
    const p = signInWithPassword("admin@e.com", "clave", { rejectStaff: true });
    // Debe estar activa de inmediato (síncrono), antes de resolver: así el
    // SupabaseAuthBridge no persiste la sesión de admin ni redirige al panel.
    expect(isBlockingStaffLogin()).toBe(true);
    await p.catch(() => {});
    expect(isBlockingStaffLogin()).toBe(false);
  });
});
