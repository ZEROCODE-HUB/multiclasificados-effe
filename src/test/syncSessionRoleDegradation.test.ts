// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Bug 2A: un error de red al leer user_roles NO debe degradar a un admin a
// "buscador". syncSession debe distinguir "error" de "0 roles legítimos".

let rolesData: Array<{ role: string }> | null = [];
let rolesError: { message: string } | null = null;
const profileData = { full_name: "Ana", initials: "AN", status: "active", suspended_until: null };

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
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1", email: "a@e.com" } } } }), signOut: async () => ({}) },
    from: (t: string) => query(t),
  },
}));
vi.mock("@/lib/push", () => ({ savePushToken: () => {} }));

const setSessionData = vi.fn((s: unknown) => s);
let prevSession: unknown = null;
vi.mock("@/hooks/useSession", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return {
    ...actual, // isStaffRole real
    setSessionData: (s: unknown) => setSessionData(s),
    clearSession: () => {},
    getSession: () => prevSession,
  };
});

import { syncSession, RoleSyncError } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  rolesData = [];
  rolesError = null;
  prevSession = null;
});

describe("syncSession — no degrada el rol ante un error de red (Bug 2A)", () => {
  it("con sesión previa + error de roles: conserva el rol vigente y NO reescribe", async () => {
    prevSession = { role: "admin", name: "Ana", initials: "AN", supabase: true };
    rolesData = null;
    rolesError = { message: "network error" };

    const s = await syncSession();
    expect(s?.role).toBe("admin");                 // conserva el rol
    expect(setSessionData).not.toHaveBeenCalled(); // no persiste un rol degradado
  });

  it("sin sesión previa + error de roles: lanza RoleSyncError y no persiste", async () => {
    prevSession = null;
    rolesData = null;
    rolesError = { message: "network error" };

    await expect(syncSession()).rejects.toBeInstanceOf(RoleSyncError);
    expect(setSessionData).not.toHaveBeenCalled();
  });

  it("0 roles SIN error (usuario legítimo sin roles): persiste como 'buscador'", async () => {
    rolesData = [];
    rolesError = null;

    const s = await syncSession();
    expect(s?.role).toBe("buscador");
    expect(setSessionData).toHaveBeenCalledTimes(1);
  });

  it("roles válidos: persiste el rol de mayor prioridad", async () => {
    rolesData = [{ role: "admin" }];
    const s = await syncSession();
    expect(s?.role).toBe("admin");
    expect(setSessionData).toHaveBeenCalledTimes(1);
  });
});
