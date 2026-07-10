import { describe, it, expect, vi } from "vitest";
import {
  auditActionLabel, auditEntityLabel, auditEntityName, auditEntityDescription, lowercaseFirst,
} from "@/lib/auditLabels";

// El bug: "Actividad reciente" del dashboard mostraba el registro crudo de
// `audit_logs` ("set_role_permission", "role soporte") mientras "Auditoría y
// registros" ya lo traducía. Las dos pantallas comparten ahora las etiquetas.

// `vi.mock` se iza al tope del archivo: lo que usa su factory debe crearse con
// `vi.hoisted` para existir antes.
const { AUDIT_LOGS } = vi.hoisted(() => ({
  AUDIT_LOGS: [
    {
      id: 1, action: "set_role_permission", entity_type: "role", entity_id: "soporte",
      ip: "190.232.10.4", created_at: "2026-07-08T12:00:00Z",
      actor: { email: "admin@effe.pe", full_name: "Rosa Pérez" },
    },
    {
      id: 2, action: "set_user_status", entity_type: "user", entity_id: "u-1",
      ip: "200.48.5.21", created_at: "2026-07-08T11:00:00Z",
      actor: { email: "admin@effe.pe", full_name: "Rosa Pérez" },
    },
  ],
}));

// Mock encadenable de supabase-js: cada tabla termina en `limit` (audit_logs)
// o en `in` (profiles / listings).
vi.mock("@/lib/supabase", () => {
  const rows = (table: string) => {
    if (table === "audit_logs") return AUDIT_LOGS;
    if (table === "profiles") return [{ id: "u-1", full_name: "Ana García", email: "ana@correo.com" }];
    return [];
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "staff" } } }) },
      rpc: async (name: string) => (name === "admin_list_listings" ? { data: [] } : { data: null }),
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.order = () => chain;
        chain.limit = async () => ({ data: rows(table), error: null });
        chain.in = async () => ({ data: rows(table), error: null });
        return chain;
      },
    },
  };
});

describe("etiquetas de auditoría", () => {
  it("traduce la acción técnica al español", () => {
    expect(auditActionLabel("set_role_permission")).toBe("Cambió permisos del rol");
    expect(auditActionLabel("broadcast")).toBe("Envió comunicado masivo");
  });

  it("una acción sin traducción no se muestra como nombre de función", () => {
    expect(auditActionLabel("some_new_action")).toBe("Some new action");
    expect(auditActionLabel(null)).toBe("—");
  });

  it("traduce el tipo y el nombre de la entidad afectada", () => {
    expect(auditEntityLabel("role")).toBe("Rol");
    expect(auditEntityName("role", "soporte")).toBe("Soporte");
    expect(auditEntityName("audience", "all")).toBe("Todos");
    expect(auditEntityDescription("role", "soporte")).toBe("Rol: Soporte");
  });

  it("resuelve el nombre del usuario cuando se conoce, y si no, acorta el ID", () => {
    const users = new Map([["u-1", "ana@correo.com"]]);
    expect(auditEntityName("user", "u-1", { users })).toBe("ana@correo.com");
    expect(auditEntityName("user", "9f8e7d6c5b4a", {})).toBe("9f8e7d6c");
  });

  it("la acción encaja en la frase de la actividad reciente", () => {
    expect(lowercaseFirst("Cambió permisos del rol")).toBe("cambió permisos del rol");
    expect(lowercaseFirst("publicó el aviso")).toBe("publicó el aviso");
  });
});

describe("fetchRecentActivity — mismas etiquetas que la pantalla de Auditoría", () => {
  it("no muestra acciones ni entidades crudas del sistema", async () => {
    const { fetchRecentActivity } = await import("@/lib/admin");
    const { data } = await fetchRecentActivity();

    const permiso = data.find((a) => a.entityType === "role");
    expect(permiso?.action).toBe("Cambió permisos del rol");
    expect(permiso?.target).toBe("Soporte");

    const estado = data.find((a) => a.entityType === "user");
    expect(estado?.action).toBe("Cambió estado del usuario");
    expect(estado?.target).toBe("ana@correo.com");

    const crudo = JSON.stringify(data);
    expect(crudo).not.toContain("set_role_permission");
    expect(crudo).not.toContain("role soporte");
  });

  it("fetchAuditLogs sigue traduciendo igual", async () => {
    const { fetchAuditLogs } = await import("@/lib/admin");
    const { data } = await fetchAuditLogs();

    expect(data[0].action).toBe("Cambió permisos del rol");
    expect(data[0].entity).toBe("Rol: Soporte");
    expect(data[1].entity).toBe("Usuario: ana@correo.com");
  });
});
