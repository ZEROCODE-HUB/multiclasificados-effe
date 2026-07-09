import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

vi.mock("@/lib/admin", () => ({
  // Nombre corto (nunca falló) + nombre largo (el que aplastaba el avatar).
  fetchAdminUsers: vi.fn().mockResolvedValue({
    data: [
      { full_name: "Ana García", email: "ana@correo.com" },
      { full_name: "María Fernanda de los Ángeles Villanueva Castromonte", email: "maria.fernanda.villanueva.castromonte@correoempresarial.com.pe" },
    ].map((u, i) => ({
      id: `24d479cf-52ce-40f4-b634-886eae34a7d${i}`,
      status: "active", verified: true, roles: "buscador", listings_count: 0,
      suspended_until: null, rating: 0, created_at: "2026-01-01T00:00:00Z", ...u,
    })),
    real: true,
  }),
  setUserStatus: vi.fn(), verifyUser: vi.fn(), deleteUser: vi.fn(), setUserRole: vi.fn(),
  grantCredits: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import AdminUsers from "@/pages/admin/AdminUsers";

/**
 * jsdom no calcula layout, así que aquí no se puede medir el ancho renderizado del
 * avatar. Lo que se blinda es la causa raíz: sin `shrink-0` el avatar es un hijo
 * flex encogible, y un nombre largo le comía el ancho manteniendo la altura, con lo
 * que el círculo salía ovalado. La medición real (32x32 en Chromium, antes 19x32)
 * se hizo con Playwright sobre el CSS compilado.
 */
describe("AdminUsers — el avatar de iniciales se mantiene circular", () => {
  const avatarFor = async (initials: string, scope: HTMLElement) => {
    await screen.findAllByText("Ana García");
    return within(scope).getByText(initials);
  };

  it("en la tabla de escritorio no se encoge aunque el nombre sea largo", async () => {
    render(<AdminUsers role="superadmin" />);
    const table = await screen.findByRole("table");

    for (const ini of ["AG", "MF"]) {
      const avatar = await avatarFor(ini, table);
      expect(avatar.className).toContain("rounded-full");
      // Alto y ancho fijos e iguales.
      expect(avatar.className).toContain("w-8");
      expect(avatar.className).toContain("h-8");
      // Lo que impide que el flexbox lo aplaste.
      expect(avatar.className).toMatch(/(^|\s)(flex-)?shrink-0(\s|$)/);
    }
  });

  it("el bloque de texto es el que cede espacio (min-w-0), no el avatar", async () => {
    render(<AdminUsers role="superadmin" />);
    const table = await screen.findByRole("table");
    const avatar = await avatarFor("MF", table);

    const textBlock = avatar.nextElementSibling as HTMLElement;
    expect(textBlock).not.toBeNull();
    expect(textBlock.className).toContain("min-w-0");
  });

  it("en las tarjetas móviles se mantiene circular", async () => {
    const { container } = render(<AdminUsers role="superadmin" />);
    await screen.findAllByText("Ana García");

    const cards = container.querySelector("div.md\\:hidden") as HTMLElement;
    expect(cards).not.toBeNull();

    const avatar = await avatarFor("MF", cards);
    expect(avatar.className).toContain("rounded-full");
    expect(avatar.className).toContain("w-10");
    expect(avatar.className).toContain("h-10");
    expect(avatar.className).toMatch(/(^|\s)(flex-)?shrink-0(\s|$)/);
  });
});
