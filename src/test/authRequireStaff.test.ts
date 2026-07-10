import { describe, it, expect, vi, beforeEach } from "vitest";

// Contraparte de authRejectStaff.test.ts: aquel vigila que el personal no entre
// por /auth; este, que un usuario normal no entre por /auth/staff.

let rolesData: Array<{ role: string }> | null = [];
let rolesError: { message: string } | null = null;
const profileData = { full_name: "Usuario", initials: "US", status: "active", suspended_until: null };

const signInWithPasswordSb = vi.fn().mockResolvedValue({ error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1", email: "u@e.com" } } } });
const signOut = vi.fn().mockResolvedValue({});

function query(table: string) {
  const p = Promise.resolve(
    table === "user_roles" ? { data: rolesData, error: rolesError } : { data: profileData, error: null },
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
      signInWithPassword: (a: unknown) => signInWithPasswordSb(a),
      getSession: () => getSession(),
      signOut: () => signOut(),
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
  isStaffRole: (r: string) => r === "admin" || r === "superadmin",
}));

import { signInWithPassword, INVALID_CREDENTIALS_MSG, isBlockingStaffLogin } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  rolesData = [];
  rolesError = null;
});

describe("signInWithPassword — /auth/staff solo admite cuentas de staff", () => {
  it("RECHAZA a un buscador con mensaje genérico y cierra la sesión recién creada", async () => {
    rolesData = [{ role: "buscador" }];
    await expect(
      signInWithPassword("user@e.com", "clave", { requireStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(setSessionData).not.toHaveBeenCalled(); // nunca se persiste → sin redirección
  });

  it("RECHAZA también a un anunciante", async () => {
    rolesData = [{ role: "anunciante" }];
    await expect(
      signInWithPassword("anun@e.com", "clave", { requireStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    expect(setSessionData).not.toHaveBeenCalled();
  });

  it("PERMITE a un admin", async () => {
    rolesData = [{ role: "admin" }];
    const s = await signInWithPassword("admin@e.com", "clave", { requireStaff: true });
    expect(signOut).not.toHaveBeenCalled();
    expect(s?.role).toBe("admin");
  });

  it("PERMITE a un superadmin", async () => {
    rolesData = [{ role: "superadmin" }];
    const s = await signInWithPassword("super@e.com", "clave", { requireStaff: true });
    expect(s?.role).toBe("superadmin");
  });

  it("FALLA CERRADA: si no se pueden leer los roles, rechaza en vez de dejar pasar", async () => {
    rolesData = null;
    rolesError = { message: "network error" };
    await expect(
      signInWithPassword("admin@e.com", "clave", { requireStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("silencia el puente DURANTE el login de staff y lo reactiva al terminar", async () => {
    rolesData = [{ role: "buscador" }];
    expect(isBlockingStaffLogin()).toBe(false);
    const p = signInWithPassword("user@e.com", "clave", { requireStaff: true });
    // Síncrono: el SIGNED_IN llega dentro de la llamada.
    expect(isBlockingStaffLogin()).toBe(true);
    await p.catch(() => {});
    expect(isBlockingStaffLogin()).toBe(false);
  });

  it("asocia el token de push al admin aceptado (el puente estaba mudo)", async () => {
    rolesData = [{ role: "admin" }];
    await signInWithPassword("admin@e.com", "clave", { requireStaff: true });
    expect(savePushToken).toHaveBeenCalledTimes(1);
  });

  it("NO asocia el token de push al usuario rechazado", async () => {
    rolesData = [{ role: "buscador" }];
    await expect(
      signInWithPassword("user@e.com", "clave", { requireStaff: true }),
    ).rejects.toThrow(INVALID_CREDENTIALS_MSG);
    // Si se asociara, este teléfono recibiría los push de la cuenta rechazada.
    expect(savePushToken).not.toHaveBeenCalled();
  });
});
