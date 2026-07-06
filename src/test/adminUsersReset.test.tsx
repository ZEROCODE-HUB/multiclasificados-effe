import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Polyfills para Radix (AlertDialog) en jsdom.
beforeEach(() => {
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) (Element.prototype as any).hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) (Element.prototype as any).releasePointerCapture = () => {};
  if (!window.matchMedia) (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
});

const USER = {
  id: "24d479cf-52ce-40f4-b634-886eae34a7df",
  full_name: "Ana García", email: "ana@correo.com", status: "active", verified: true,
  roles: "buscador", listings_count: 0, suspended_until: null, rating: 0, created_at: "2026-01-01T00:00:00Z",
};

const fetchAdminUsers = vi.fn().mockResolvedValue({ data: [USER], real: true });
vi.mock("@/lib/admin", () => ({
  fetchAdminUsers: (...a: unknown[]) => fetchAdminUsers(...a),
  setUserStatus: vi.fn(), verifyUser: vi.fn(), deleteUser: vi.fn(), setUserRole: vi.fn(),
  grantCredits: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));

const invoke = vi.fn().mockResolvedValue({
  data: { ok: true, email: "ana@correo.com", link: "https://multiclasificados-effe.vercel.app/reset-password?token_hash=abc123&type=recovery" },
  error: null,
});
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import AdminUsers from "@/pages/admin/AdminUsers";

beforeEach(() => {
  vi.clearAllMocks();
  fetchAdminUsers.mockResolvedValue({ data: [USER], real: true });
  invoke.mockResolvedValue({
    data: { ok: true, email: "ana@correo.com", link: "https://multiclasificados-effe.vercel.app/reset-password?token_hash=abc123&type=recovery" },
    error: null,
  });
  (navigator as any).clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
});

describe("AdminUsers — enlace seguro de restablecimiento", () => {
  it("genera el enlace vía Edge Function y lo muestra para copiar", async () => {
    render(<AdminUsers role="superadmin" />);
    // Espera a que cargue el usuario mock.
    expect((await screen.findAllByText("Ana García")).length).toBeGreaterThan(0);

    // Clic en el botón de la llave (restablecer contraseña).
    fireEvent.click(screen.getAllByTitle("Restablecer contraseña")[0]);

    // Invoca la Edge Function con el user_id correcto.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("admin-reset-password", { body: { user_id: USER.id } }),
    );

    // El enlace generado aparece en un input de solo lectura.
    const input = (await screen.findAllByDisplayValue(/token_hash=abc123/))[0] as HTMLInputElement;
    expect(input.readOnly).toBe(true);
  });

  it("copia el enlace al portapapeles", async () => {
    render(<AdminUsers role="superadmin" />);
    await screen.findAllByText("Ana García");
    fireEvent.click(screen.getAllByTitle("Restablecer contraseña")[0]);
    await screen.findAllByDisplayValue(/token_hash=abc123/);

    fireEvent.click(screen.getAllByTitle("Copiar enlace")[0]);
    await waitFor(() =>
      expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("token_hash=abc123"),
      ),
    );
  });

  it("muestra error si la Edge Function falla", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "No autorizado" } });
    render(<AdminUsers role="superadmin" />);
    await screen.findAllByText("Ana García");
    fireEvent.click(screen.getAllByTitle("Restablecer contraseña")[0]);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
  });
});
