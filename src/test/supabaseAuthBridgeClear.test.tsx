import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Bug 2B: el puente borraba la sesión local ante CUALQUIER evento con session=null
// (incluido un auto-refresh transitorio fallido) → cierres espontáneos. Ahora solo
// limpia en un cierre REAL (event === "SIGNED_OUT").

const { state } = vi.hoisted(() => ({
  state: {
    emit: (() => {}) as (e: string, s: unknown) => void,
    local: null as unknown, // lo que devuelve getSession() (la sesión local)
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (f: (e: string, s: unknown) => void) => {
        state.emit = f;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async () => ({}),
    },
    realtime: { setAuth: () => {} },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}));

const clearSession = vi.fn();
vi.mock("@/hooks/useSession", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, clearSession: () => clearSession(), getSession: () => state.local, setSessionData: (s: unknown) => s };
});
vi.mock("@/lib/push", () => ({ savePushToken: () => {} }));
vi.mock("sonner", () => ({ toast: { error: () => {} } }));

import { SupabaseAuthBridge } from "@/components/SupabaseAuthBridge";

const supaLocal = { role: "admin", name: "Ana", initials: "AN", supabase: true };
const demoLocal = { role: "admin", name: "Ana", initials: "AN", supabase: false };

beforeEach(() => { vi.clearAllMocks(); state.emit = () => {}; state.local = null; });

describe("SupabaseAuthBridge — limpia solo en cierre real (Bug 2B)", () => {
  it("SIGNED_OUT con sesión de Supabase → limpia", async () => {
    state.local = supaLocal;
    render(<SupabaseAuthBridge />);
    await state.emit("SIGNED_OUT", null);
    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it("TOKEN_REFRESHED con session=null (refresh transitorio) → NO limpia", async () => {
    state.local = supaLocal;
    render(<SupabaseAuthBridge />);
    await state.emit("TOKEN_REFRESHED", null);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("INITIAL_SESSION sin sesión → NO limpia", async () => {
    state.local = supaLocal;
    render(<SupabaseAuthBridge />);
    await state.emit("INITIAL_SESSION", null);
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("SIGNED_OUT con sesión demo (no Supabase) → NO limpia", async () => {
    state.local = demoLocal;
    render(<SupabaseAuthBridge />);
    await state.emit("SIGNED_OUT", null);
    expect(clearSession).not.toHaveBeenCalled();
  });
});
