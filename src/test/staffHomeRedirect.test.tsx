import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Session, SessionRole } from "@/hooks/useSession";

// Bug 3: un staff YA logueado que abre "/" debe ir directo a su panel, no navegar
// la home como usuario. Solo aplica a "/": otras rutas públicas siguen abiertas.

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/push", () => ({ savePushToken: () => {} }));

const { sessionRef } = vi.hoisted(() => ({ sessionRef: { current: null as Session | null } }));
vi.mock("@/hooks/useSession", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useSession: () => sessionRef.current }; // isStaffRole real
});

import { StaffHomeRedirect } from "@/components/StaffHomeRedirect";

const sess = (role: SessionRole): Session => ({ role, name: "Ana", initials: "AN", supabase: true });

function renderHome(session: Session | null) {
  sessionRef.current = session;
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<StaffHomeRedirect><div>HOME PUBLICA</div></StaffHomeRedirect>} />
        <Route path="/dashboard/admin" element={<div>PANEL ADMIN</div>} />
        <Route path="/dashboard/superadmin" element={<div>PANEL SUPER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { sessionRef.current = null; });

describe("StaffHomeRedirect (Bug 3)", () => {
  it("admin → redirige a /dashboard/admin", () => {
    renderHome(sess("admin"));
    expect(screen.getByText("PANEL ADMIN")).toBeInTheDocument();
    expect(screen.queryByText("HOME PUBLICA")).not.toBeInTheDocument();
  });

  it("superadmin → redirige a /dashboard/superadmin", () => {
    renderHome(sess("superadmin"));
    expect(screen.getByText("PANEL SUPER")).toBeInTheDocument();
  });

  it("soporte/moderador → al panel admin", () => {
    renderHome(sess("soporte"));
    expect(screen.getByText("PANEL ADMIN")).toBeInTheDocument();
  });

  it("anunciante ve la home pública", () => {
    renderHome(sess("anunciante"));
    expect(screen.getByText("HOME PUBLICA")).toBeInTheDocument();
  });

  it("invitado (sin sesión) ve la home pública", () => {
    renderHome(null);
    expect(screen.getByText("HOME PUBLICA")).toBeInTheDocument();
  });

  it("sesión demo (sin flag supabase) ve la home pública", () => {
    renderHome({ role: "admin", name: "x", initials: "x", supabase: false } as Session);
    expect(screen.getByText("HOME PUBLICA")).toBeInTheDocument();
  });
});
