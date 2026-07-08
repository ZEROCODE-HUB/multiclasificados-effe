import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Session, SessionRole } from "@/hooks/useSession";

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

const { sessionRef } = vi.hoisted(() => ({ sessionRef: { current: null as Session | null } }));
vi.mock("@/hooks/useSession", async (orig) => {
  const actual = await (orig() as Promise<Record<string, unknown>>);
  return { ...actual, useSession: () => sessionRef.current };
});

vi.mock("@/hooks/useUnreadMessages", () => ({ useUnreadMessages: () => 0 }));
vi.mock("@/components/NotificationsBell", () => ({ NotificationsBell: () => null }));
vi.mock("@/components/MobileBottomNav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/components/CreditsBalance", () => ({ CreditsBalance: () => <div>CHIP CREDITOS</div> }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));

import { Navbar } from "@/components/Navbar";

const sess = (role: SessionRole): Session => ({ role, name: "Ana Gómez", initials: "AG", supabase: true });

function renderNav(role: SessionRole | null) {
  sessionRef.current = role ? sess(role) : null;
  render(<MemoryRouter><Navbar /></MemoryRouter>);
}

// Todo enlace que apunte a un panel de usuario.
const userPanelLinks = () =>
  screen.queryAllByRole("link").filter((a) => {
    const href = a.getAttribute("href") ?? "";
    return href.startsWith("/dashboard/anunciante") || href.startsWith("/dashboard/buscador");
  });

beforeEach(() => { vi.clearAllMocks(); sessionRef.current = null; });

describe("Navbar — al staff no se le muestran enlaces a paneles de usuario", () => {
  it("ADMIN: ningún enlace a /dashboard/anunciante ni /dashboard/buscador", () => {
    renderNav("admin");
    expect(userPanelLinks()).toHaveLength(0);
  });

  it("SUPERADMIN: tampoco", () => {
    renderNav("superadmin");
    expect(userPanelLinks()).toHaveLength(0);
  });

  it("ADMIN: no ve 'Publicar' ni el saldo de créditos", () => {
    renderNav("admin");
    expect(screen.queryByText("Publicar")).not.toBeInTheDocument();
    expect(screen.queryByText("CHIP CREDITOS")).not.toBeInTheDocument();
  });

  it("ANUNCIANTE: sí ve 'Publicar', créditos y sus enlaces de panel", () => {
    renderNav("anunciante");
    expect(screen.getAllByText("Publicar").length).toBeGreaterThan(0);
    expect(screen.getByText("CHIP CREDITOS")).toBeInTheDocument();
    expect(userPanelLinks().length).toBeGreaterThan(0);
  });

  it("INVITADO: sigue viendo 'Publicar' (lo lleva al login)", () => {
    renderNav(null);
    expect(screen.getAllByText("Publicar").length).toBeGreaterThan(0);
  });
});

describe("Navbar — menú móvil (hamburguesa)", () => {
  const openMobileMenu = () => fireEvent.click(screen.getByRole("button", { name: "Menú" }));

  it("ADMIN: ve su panel y cerrar sesión; NO 'Ingresar' ni 'Publicar aviso'", () => {
    renderNav("admin");
    openMobileMenu();

    expect(screen.getByText("Ir al panel admin")).toBeInTheDocument();
    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();
    expect(screen.getByText("Administrador")).toBeInTheDocument();
    // Antes caía en la rama de invitado y le ofrecía iniciar sesión y publicar.
    expect(screen.queryByText("Ingresar")).not.toBeInTheDocument();
    expect(screen.queryByText("Publicar aviso")).not.toBeInTheDocument();
    expect(userPanelLinks()).toHaveLength(0);
  });

  it("SUPERADMIN: el encabezado del menú lo identifica", () => {
    renderNav("superadmin");
    openMobileMenu();
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
    expect(userPanelLinks()).toHaveLength(0);
  });

  it("INVITADO: sigue viendo 'Ingresar' y 'Publicar aviso'", () => {
    renderNav(null);
    openMobileMenu();
    // "Ingresar" aparece también en el trigger de escritorio: basta con que exista.
    expect(screen.getAllByText("Ingresar").length).toBeGreaterThan(0);
    expect(screen.getByText("Publicar aviso")).toBeInTheDocument();
  });
});
