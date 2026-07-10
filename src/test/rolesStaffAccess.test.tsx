import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Session, SessionRole } from "@/hooks/useSession";

/**
 * Moderador y Soporte no podían entrar al panel: `isStaffRole` era
 * admin|superadmin, y la Matriz de permisos configuraba dos roles que rebotaban
 * en la puerta. Ahora entran al panel de administración —no tienen uno propio— y
 * lo que ven dentro lo recorta la matriz.
 */

const { sessionRef } = vi.hoisted(() => ({ sessionRef: { current: null as Session | null } }));
vi.mock("@/hooks/useSession", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useSession: () => sessionRef.current };
});

vi.mock("@/lib/mfa", () => ({ getMfaState: vi.fn().mockResolvedValue({ currentLevel: "aal2" }) }));
vi.mock("@/components/MfaGate", () => ({ MfaGate: () => <div>MFA</div> }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { RequireRole } from "@/components/RequireRole";
import { isStaffRole } from "@/hooks/useSession";
import { landingPath } from "@/lib/auth";

const sess = (role: SessionRole): Session => ({ role, name: "X", initials: "X", supabase: true });
const PROTEGIDO = "CONTENIDO PROTEGIDO";

const renderGuard = (min: SessionRole, role: SessionRole, path = "/dashboard/admin") => {
  sessionRef.current = sess(role);
  render(
    <MemoryRouter initialEntries={[path]}>
      <RequireRole min={min}><div>{PROTEGIDO}</div></RequireRole>
    </MemoryRouter>,
  );
};

beforeEach(() => { sessionRef.current = null; });

describe("moderador y soporte son personal de la plataforma", () => {
  it("isStaffRole los reconoce", () => {
    expect(isStaffRole("moderador")).toBe(true);
    expect(isStaffRole("soporte")).toBe(true);
  });

  it("los usuarios normales siguen sin serlo", () => {
    expect(isStaffRole("buscador")).toBe(false);
    expect(isStaffRole("anunciante")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });
});

describe("acceso al panel de administración", () => {
  it("el moderador entra", async () => {
    renderGuard("soporte", "moderador");
    expect(await screen.findByText(PROTEGIDO)).toBeInTheDocument();
  });

  it("el soporte entra", async () => {
    renderGuard("soporte", "soporte");
    expect(await screen.findByText(PROTEGIDO)).toBeInTheDocument();
  });

  it("el admin y el superadmin siguen entrando", async () => {
    renderGuard("soporte", "admin");
    expect(await screen.findByText(PROTEGIDO)).toBeInTheDocument();
  });

  it("un buscador no entra", async () => {
    renderGuard("soporte", "buscador");
    expect(await screen.findByText("Acceso denegado")).toBeInTheDocument();
    expect(screen.queryByText(PROTEGIDO)).toBeNull();
  });
});

describe("la jerarquía no se hereda hacia arriba ni hacia abajo", () => {
  it("moderador y soporte NO entran al área de superadmin", async () => {
    renderGuard("superadmin", "moderador", "/dashboard/superadmin/roles");
    expect(await screen.findByText("Acceso denegado")).toBeInTheDocument();

    renderGuard("superadmin", "soporte", "/dashboard/superadmin/roles");
    expect((await screen.findAllByText("Acceso denegado")).length).toBeGreaterThan(0);
  });

  it("tampoco operan como usuarios: el panel de buscador les queda vedado", async () => {
    renderGuard("buscador", "moderador", "/dashboard/buscador");
    expect(await screen.findByText(/no pueden usar los paneles de usuario/i)).toBeInTheDocument();
  });
});

describe("a dónde aterrizan al iniciar sesión", () => {
  it("moderador y soporte van al panel de administración: no tienen uno propio", () => {
    expect(landingPath(sess("moderador"))).toBe("/dashboard/admin");
    expect(landingPath(sess("soporte"))).toBe("/dashboard/admin");
  });

  it("el superadmin va al suyo, y el admin al de admin", () => {
    expect(landingPath(sess("superadmin"))).toBe("/dashboard/superadmin");
    expect(landingPath(sess("admin"))).toBe("/dashboard/admin");
  });

  it("un usuario normal va a la portada", () => {
    expect(landingPath(sess("buscador"))).toBe("/");
  });
});
