import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mockeamos solo la lectura de la matriz; la lógica de decisión es real.
const getMyPermissions = vi.fn();
vi.mock("@/lib/admin", () => ({
  getMyPermissions: (...a: unknown[]) => getMyPermissions(...a),
}));

import { usePermissions } from "@/hooks/usePermissions";
import type { MyPermission } from "@/lib/admin";

const perm = (module: string, over: Partial<MyPermission> = {}): MyPermission => ({
  module, can_view: true, can_edit: true, can_approve: true, can_delete: true, ...over,
});

beforeEach(() => getMyPermissions.mockReset());

describe("usePermissions — enforcement de Roles y permisos", () => {
  it("superadmin (enforce=false): acceso total y NO consulta la matriz", () => {
    const { result } = renderHook(() => usePermissions(false));
    expect(result.current.ready).toBe(true);
    expect(result.current.can("Gestión de usuarios", "delete")).toBe(true);
    expect(result.current.can("Reportes", "view")).toBe(true);
    expect(getMyPermissions).not.toHaveBeenCalled();
  });

  it("admin: permisivo mientras carga (anti-lockout)", async () => {
    let resolve!: (v: Record<string, MyPermission>) => void;
    getMyPermissions.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => usePermissions(true));
    // Antes de resolver: no listo, pero deja ver todo para no ocultar de más.
    expect(result.current.ready).toBe(false);
    expect(result.current.can("Gestión de usuarios", "view")).toBe(true);
    resolve({});
    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it("admin: módulo sin fila en la BD -> permisivo (aún no configurado)", async () => {
    getMyPermissions.mockResolvedValue({});
    const { result } = renderHook(() => usePermissions(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.can("Gestión de avisos", "view")).toBe(true);
    expect(result.current.can("Gestión de avisos", "delete")).toBe(true);
  });

  it("admin: aplica view/edit/delete según la matriz", async () => {
    getMyPermissions.mockResolvedValue({
      "Gestión de usuarios": perm("Gestión de usuarios", { can_view: false, can_edit: false, can_approve: false, can_delete: false }),
      "Reportes": perm("Reportes", { can_edit: false, can_approve: false, can_delete: false }), // solo lectura
      "Gestión de avisos": perm("Gestión de avisos", { can_delete: false }),                    // modera, no elimina
    });
    const { result } = renderHook(() => usePermissions(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const can = result.current.can;

    // Usuarios: oculto del menú y ruta bloqueada.
    expect(can("Gestión de usuarios", "view")).toBe(false);
    expect(can("Gestión de usuarios", "edit")).toBe(false);
    expect(can("Gestión de usuarios", "delete")).toBe(false);
    // Reportes: se ve pero no se edita.
    expect(can("Reportes", "view")).toBe(true);
    expect(can("Reportes", "edit")).toBe(false);
    // Avisos: puede moderar (edit) pero no eliminar.
    expect(can("Gestión de avisos", "edit")).toBe(true);
    expect(can("Gestión de avisos", "delete")).toBe(false);
  });

  it("acción por defecto = view; módulo undefined (Dashboard/Roles) -> siempre visible", async () => {
    getMyPermissions.mockResolvedValue({
      "Reportes": perm("Reportes", { can_view: false }),
    });
    const { result } = renderHook(() => usePermissions(true));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.can("Reportes")).toBe(false);   // sin acción => view
    expect(result.current.can(undefined)).toBe(true);      // ítems sin módulo
  });
});
