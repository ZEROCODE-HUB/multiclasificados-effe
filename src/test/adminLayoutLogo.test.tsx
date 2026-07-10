import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Polyfills para Radix (Sheet) en jsdom.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

// La sesión real no importa para este test; devolvemos algo genérico.
vi.mock("@/hooks/useSession", () => ({ useSession: () => null }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn().mockResolvedValue(undefined) }));

import { AdminLayout } from "@/components/AdminLayout";

function renderLayout(role: "admin" | "superadmin") {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/${role}`]}>
      <AdminLayout role={role} title="Panel">
        <div>contenido</div>
      </AdminLayout>
    </MemoryRouter>,
  );
}

describe("AdminLayout — el logo lleva al dashboard, no al inicio público", () => {
  it("el logo del sidebar (superadmin) apunta a /dashboard/superadmin", () => {
    renderLayout("superadmin");
    // El logo del sidebar de escritorio envuelve el texto "eFFe Multi".
    const logo = screen.getByText("eFFe").closest("a");
    expect(logo).toBeTruthy();
    expect(logo?.getAttribute("href")).toBe("/dashboard/superadmin");
  });

  it("ningún logo del layout apunta al inicio público '/'", () => {
    renderLayout("superadmin");
    const homeLinks = Array.from(document.querySelectorAll("a")).filter(
      (a) => a.getAttribute("href") === "/",
    );
    expect(homeLinks).toHaveLength(0);
  });

  it("para el rol admin el logo apunta a /dashboard/admin", () => {
    renderLayout("admin");
    const logo = screen.getByText("eFFe").closest("a");
    expect(logo?.getAttribute("href")).toBe("/dashboard/admin");
  });
});
