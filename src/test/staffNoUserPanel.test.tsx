import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Session, SessionRole } from "@/hooks/useSession";

// Sesión controlable por test.
const { sessionRef } = vi.hoisted(() => ({ sessionRef: { current: null as Session | null } }));
vi.mock("@/hooks/useSession", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useSession: () => sessionRef.current };
});

// El staff necesita 2FA (aal2) para su panel; lo damos por cumplido.
vi.mock("@/lib/mfa", () => ({ getMfaState: vi.fn().mockResolvedValue({ currentLevel: "aal2" }) }));
vi.mock("@/components/MfaGate", () => ({ MfaGate: () => <div>MFA</div> }));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { RequireRole } from "@/components/RequireRole";
import { landingPath } from "@/lib/auth";

const sess = (role: SessionRole): Session => ({ role, name: "X", initials: "X", supabase: true });

function renderGuard(min: SessionRole, role: SessionRole, path = "/dashboard/buscador") {
  sessionRef.current = sess(role);
  render(
    <MemoryRouter initialEntries={[path]}>
      <RequireRole min={min}>
        <div>CONTENIDO PROTEGIDO</div>
      </RequireRole>
    </MemoryRouter>,
  );
}

beforeEach(() => { vi.clearAllMocks(); sessionRef.current = null; });

describe("RequireRole — el staff no entra a los paneles de usuario", () => {
  it("ADMIN en el panel de usuario (min=buscador) → Acceso denegado, sin contenido", () => {
    renderGuard("buscador", "admin");
    expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
    expect(screen.getByText(/no pueden usar los paneles de usuario/i)).toBeInTheDocument();
    expect(screen.queryByText("CONTENIDO PROTEGIDO")).not.toBeInTheDocument();
  });

  it("SUPERADMIN en el panel de usuario → Acceso denegado", () => {
    renderGuard("buscador", "superadmin");
    expect(screen.getByText("Acceso denegado")).toBeInTheDocument();
    expect(screen.queryByText("CONTENIDO PROTEGIDO")).not.toBeInTheDocument();
  });

  it("ADMIN en el panel de anunciante tampoco entra", () => {
    renderGuard("buscador", "admin", "/dashboard/anunciante/publicar");
    expect(screen.queryByText("CONTENIDO PROTEGIDO")).not.toBeInTheDocument();
  });

  it("BUSCADOR sí entra a su panel", () => {
    renderGuard("buscador", "buscador");
    expect(screen.getByText("CONTENIDO PROTEGIDO")).toBeInTheDocument();
  });

  it("ANUNCIANTE sí entra a su panel", () => {
    renderGuard("buscador", "anunciante");
    expect(screen.getByText("CONTENIDO PROTEGIDO")).toBeInTheDocument();
  });

  it("ADMIN sí entra a su propio panel (min=admin)", async () => {
    renderGuard("admin", "admin", "/dashboard/admin");
    expect(await screen.findByText("CONTENIDO PROTEGIDO")).toBeInTheDocument();
  });

  it("ADMIN no entra al área de superadmin (jerarquía hacia arriba intacta)", async () => {
    renderGuard("superadmin", "admin", "/dashboard/superadmin");
    await waitFor(() => expect(screen.getByText("Acceso denegado")).toBeInTheDocument());
    expect(screen.queryByText("CONTENIDO PROTEGIDO")).not.toBeInTheDocument();
  });
});

describe("landingPath — el redirect no puede meter al staff en zona de usuario", () => {
  it("ADMIN con redirect a un panel de usuario aterriza en SU panel", () => {
    expect(landingPath(sess("admin"), "/dashboard/buscador")).toBe("/dashboard/admin");
    expect(landingPath(sess("admin"), "/dashboard/anunciante/publicar")).toBe("/dashboard/admin");
  });

  it("SUPERADMIN con redirect a zona de usuario aterriza en SU panel", () => {
    expect(landingPath(sess("superadmin"), "/dashboard/buscador")).toBe("/dashboard/superadmin");
  });

  it("ADMIN con redirect dentro de su área SÍ lo respeta", () => {
    expect(landingPath(sess("admin"), "/dashboard/admin/usuarios")).toBe("/dashboard/admin/usuarios");
  });

  it("no confunde un prefijo parecido con el área de staff", () => {
    expect(landingPath(sess("admin"), "/dashboard/administrador-x")).toBe("/dashboard/admin");
  });

  it("usuario normal: se respeta su redirect", () => {
    expect(landingPath(sess("buscador"), "/dashboard/buscador/favoritos")).toBe("/dashboard/buscador/favoritos");
  });

  it("usuario normal sin redirect va al inicio", () => {
    expect(landingPath(sess("buscador"), null)).toBe("/");
  });
});
