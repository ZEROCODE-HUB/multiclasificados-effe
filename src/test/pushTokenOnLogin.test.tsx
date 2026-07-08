import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// El puente de auth se silencia durante el login de usuario (`blockingStaffLogin`).
// Antes eso se llevaba por delante el registro del token de push: en el APK, quien
// entraba con correo y contraseña dejaba de recibir notificaciones.
// Estos tests fijan quién registra el token en cada camino.

const { state } = vi.hoisted(() => ({
  state: {
    roles: [{ role: "buscador" }] as Array<{ role: string }> | null,
    rolesError: null as { message: string } | null,
    status: "active" as string,
    // Emisor del evento SIGNED_IN: supabase-js lo despacha DENTRO de
    // signInWithPassword (lo await-ea), no después.
    emit: (() => {}) as (e: string, s: unknown) => void,
  },
}));

const session = { user: { id: "u1", email: "u@e.com" }, access_token: "t" };
const signOut = vi.fn().mockResolvedValue({});

function query(table: string) {
  const profile = { full_name: "Ana", initials: "AN", status: state.status, suspended_until: null };
  const p = Promise.resolve(
    table === "user_roles"
      ? { data: state.roles, error: state.rolesError }
      : { data: profile, error: null },
  );
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    maybeSingle: () => Promise.resolve({ data: profile }),
    then: (f: (v: unknown) => unknown, r: (e: unknown) => unknown) => p.then(f, r),
  };
  return b;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: async () => { await state.emit("SIGNED_IN", session); return { error: null }; },
      getSession: async () => ({ data: { session } }),
      signOut: (...a: unknown[]) => signOut(...a),
      onAuthStateChange: (f: (e: string, s: unknown) => void) => {
        state.emit = f;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    realtime: { setAuth: () => {} },
    from: (t: string) => query(t),
  },
}));

vi.mock("@/hooks/useSession", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, setSessionData: (s: unknown) => s, clearSession: () => {}, getSession: () => null };
});
vi.mock("sonner", () => ({ toast: { error: () => {} } }));

const savePushToken = vi.fn();
vi.mock("@/lib/push", () => ({ savePushToken: () => savePushToken() }));

import { SupabaseAuthBridge } from "@/components/SupabaseAuthBridge";
import { signInWithPassword } from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  state.roles = [{ role: "buscador" }];
  state.rolesError = null;
  state.status = "active";
  state.emit = () => {};
});

describe("Registro del token de push al iniciar sesión", () => {
  it("USUARIO por /auth: se registra el token exactamente una vez", async () => {
    render(<SupabaseAuthBridge />);
    await signInWithPassword("u@e.com", "clave", { rejectStaff: true });
    expect(savePushToken).toHaveBeenCalledTimes(1);
  });

  it("STAFF por /auth/staff: lo registra el puente (el flag no se activa)", async () => {
    state.roles = [{ role: "admin" }];
    render(<SupabaseAuthBridge />);
    await signInWithPassword("admin@e.com", "clave", { rejectStaff: false });
    expect(savePushToken).toHaveBeenCalledTimes(1);
  });

  it("ADMIN rechazado por /auth: el teléfono NO queda asociado a la cuenta de admin", async () => {
    state.roles = [{ role: "admin" }];
    render(<SupabaseAuthBridge />);
    await signInWithPassword("admin@e.com", "clave", { rejectStaff: true }).catch(() => {});
    expect(savePushToken).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
  });

  it("cuenta BANEADA: no registra el token (syncSession la bloquea antes)", async () => {
    state.status = "banned";
    render(<SupabaseAuthBridge />);
    await expect(
      signInWithPassword("u@e.com", "clave", { rejectStaff: true }),
    ).rejects.toThrow(/baneada/i);
    expect(savePushToken).not.toHaveBeenCalled();
  });

  it("cuenta SUSPENDIDA: tampoco registra el token", async () => {
    state.status = "suspended";
    render(<SupabaseAuthBridge />);
    await expect(
      signInWithPassword("u@e.com", "clave", { rejectStaff: true }),
    ).rejects.toThrow(/suspendida/i);
    expect(savePushToken).not.toHaveBeenCalled();
  });

  it("si no se pueden leer los roles (falla cerrada): no registra el token", async () => {
    state.roles = null;
    state.rolesError = { message: "network error" };
    render(<SupabaseAuthBridge />);
    await signInWithPassword("u@e.com", "clave", { rejectStaff: true }).catch(() => {});
    expect(savePushToken).not.toHaveBeenCalled();
  });
});
