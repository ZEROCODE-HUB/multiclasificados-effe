import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// "Anunciante" se retiró del filtro y del selector de rol: todo buscador puede
// publicar, así que la distinción no existía. Lo delicado no es esconder la
// opción, sino que los usuarios que aún tienen el rol heredado `anunciante`
// guardado en la BD sigan siendo visibles y filtrables como "Buscador".

beforeEach(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

const base = {
  status: "active", verified: false, listings_count: 0,
  suspended_until: null, rating: 0, created_at: "2026-01-01T00:00:00Z",
};
// Usuario con el rol viejo todavía guardado en la BD.
const LEGACY = { ...base, id: "11111111-1111-1111-1111-111111111111", full_name: "Luis Torres", email: "luis@correo.com", roles: "anunciante" };
const SEEKER = { ...base, id: "22222222-2222-2222-2222-222222222222", full_name: "Ana García", email: "ana@correo.com", roles: "buscador" };
const ADMIN  = { ...base, id: "33333333-3333-3333-3333-333333333333", full_name: "Rosa Pérez", email: "rosa@correo.com", roles: "admin" };

const fetchAdminUsers = vi.fn().mockResolvedValue({ data: [LEGACY, SEEKER, ADMIN], real: true });
vi.mock("@/lib/admin", () => ({
  fetchAdminUsers: (...a: unknown[]) => fetchAdminUsers(...a),
  setUserStatus: vi.fn(), verifyUser: vi.fn(), deleteUser: vi.fn(), setUserRole: vi.fn(),
  grantCredits: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import AdminUsers from "@/pages/admin/AdminUsers";

/**
 * Abre el filtro de roles (primer combobox de la cabecera). En jsdom el
 * `pointerdown` de Radix no dispara; el teclado sí, y es el mismo camino.
 */
const openRoleFilter = () => {
  const filter = screen.getAllByRole("combobox")[0];
  fireEvent.keyDown(filter, { key: "Enter", code: "Enter" });
  return filter;
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchAdminUsers.mockResolvedValue({ data: [LEGACY, SEEKER, ADMIN], real: true });
});

describe("AdminUsers — el filtro de roles ya no ofrece Anunciante", () => {
  it("el desplegable no lista Anunciante", async () => {
    render(<AdminUsers role="superadmin" />);
    await screen.findAllByText("Ana García");

    openRoleFilter();
    await screen.findByRole("option", { name: "Buscador" });

    expect(screen.queryByRole("option", { name: "Anunciante" })).toBeNull();
    ["Todos los roles", "Buscador", "Moderador", "Soporte", "Admin", "Super Admin"].forEach((label) => {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    });
  });

  it("filtrar por Buscador incluye a quien conserva el rol heredado anunciante", async () => {
    render(<AdminUsers role="superadmin" />);
    await screen.findAllByText("Ana García");

    openRoleFilter();
    fireEvent.click(await screen.findByRole("option", { name: "Buscador" }));

    // Luis tiene `anunciante` en la BD y aun así debe aparecer.
    await waitFor(() => expect(screen.getAllByText("Luis Torres").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Ana García").length).toBeGreaterThan(0);
    // Y el filtro sigue excluyendo a quien no es buscador.
    expect(screen.queryByText("Rosa Pérez")).toBeNull();
  });

  it("filtrar por Admin no arrastra a los buscadores", async () => {
    render(<AdminUsers role="superadmin" />);
    await screen.findAllByText("Ana García");

    openRoleFilter();
    fireEvent.click(await screen.findByRole("option", { name: "Admin" }));

    await waitFor(() => expect(screen.getAllByText("Rosa Pérez").length).toBeGreaterThan(0));
    expect(screen.queryByText("Luis Torres")).toBeNull();
    expect(screen.queryByText("Ana García")).toBeNull();
  });

  it("la celda de rol muestra Buscador para el usuario con rol heredado", async () => {
    render(<AdminUsers role="superadmin" />);
    // Esperar a los datos: si no, `row` resuelve solo con la fila de cabecera.
    await screen.findAllByText("Luis Torres");
    const luisRow = screen.getAllByRole("row").find((r) => within(r).queryByText("Luis Torres"));
    expect(luisRow).toBeDefined();
    // El selector de rol de esa fila no puede quedar vacío ni decir "Anunciante".
    expect(within(luisRow!).getByRole("combobox")).toHaveTextContent("Buscador");
  });
});
