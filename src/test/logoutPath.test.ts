// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// auth.ts arrastra supabase y push al importarse; los stubeamos porque logoutPath
// es una función pura que solo depende de isStaffRole (real, de useSession).
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/push", () => ({ savePushToken: () => {} }));

import { logoutPath } from "@/lib/auth";

describe("logoutPath — destino tras cerrar sesión", () => {
  it("el staff vuelve a su login (/auth/staff)", () => {
    for (const r of ["admin", "superadmin", "moderador", "soporte"] as const) {
      expect(logoutPath(r)).toBe("/auth/staff");
    }
  });

  it("usuario e invitado van a la portada (/)", () => {
    expect(logoutPath("anunciante")).toBe("/");
    expect(logoutPath("buscador")).toBe("/");
    expect(logoutPath(null)).toBe("/");
    expect(logoutPath(undefined)).toBe("/");
  });
});
