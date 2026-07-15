// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  PERM_MODULES, MATRIX_MODULES, MODULE_BY_SUB, actionsFor, capabilitiesFor,
} from "@/lib/permissions";

// El catálogo es la fuente de verdad de la matriz "Roles y permisos" y del menú.
// Estos tests protegen dos cosas frágiles: (1) los ids deben ser EXACTOS a los de
// la BD (si no, el join de has_perm/get_my_permissions falla en silencio), y
// (2) no deben reaparecer "casillas fantasma" (acciones sin efecto).

const EXPECTED_IDS = [
  "Gestión de avisos", "Gestión de usuarios", "Configuración comercial", "Pagos y planes",
  "Conversaciones reportadas", "Reportes", "Comunicaciones", "Auditoría y logs",
];

describe("catálogo de permisos", () => {
  it("declara los 8 módulos con sus ids EXACTOS de la BD", () => {
    expect(PERM_MODULES.map((m) => m.id)).toEqual(EXPECTED_IDS);
  });

  it("MATRIX_MODULES excluye los superadmin-only (Auditoría)", () => {
    expect(MATRIX_MODULES).toHaveLength(7);
    expect(MATRIX_MODULES.map((m) => m.id)).not.toContain("Auditoría y logs");
  });

  it("MODULE_BY_SUB mapea cada sub-ruta a su módulo", () => {
    expect(MODULE_BY_SUB.avisos).toBe("Gestión de avisos");
    expect(MODULE_BY_SUB.tarifas).toBe("Pagos y planes");
    expect(MODULE_BY_SUB.conversaciones).toBe("Conversaciones reportadas");
    expect(MODULE_BY_SUB.auditoria).toBe("Auditoría y logs");
  });

  it("cada acción declarada tiene key válida, label y descripción, sin duplicados", () => {
    const valid = new Set(["view", "edit", "approve", "delete"]);
    for (const m of PERM_MODULES) {
      expect(m.actions.length).toBeGreaterThan(0);
      for (const a of m.actions) {
        expect(valid.has(a.key)).toBe(true);
        expect(a.label.trim().length).toBeGreaterThan(0);
        expect(a.description.trim().length).toBeGreaterThan(0);
      }
      expect(new Set(m.actions.map((a) => a.key)).size).toBe(m.actions.length);
    }
  });

  it("solo Reportes y Auditoría son de lectura pura (sin edit)", () => {
    expect(actionsFor("Reportes").map((a) => a.key)).toEqual(["view"]);
    expect(actionsFor("Auditoría y logs").map((a) => a.key)).toEqual(["view"]);
  });

  it("Comercial, Tarifas y Comunicaciones ahora declaran view+edit (efecto real vía has_perm)", () => {
    for (const id of ["Configuración comercial", "Pagos y planes", "Comunicaciones"]) {
      expect(actionsFor(id).map((a) => a.key)).toEqual(["view", "edit"]);
    }
  });

  it("usuarios declara las 4 acciones reales; avisos y reclamos, view+edit", () => {
    expect(actionsFor("Gestión de usuarios").map((a) => a.key)).toEqual(["view", "edit", "approve", "delete"]);
    expect(actionsFor("Gestión de avisos").map((a) => a.key)).toEqual(["view", "edit"]);
    expect(actionsFor("Conversaciones reportadas").map((a) => a.key)).toEqual(["view", "edit"]);
  });

  it("capabilitiesFor solo cuenta acciones DECLARADAS y activadas", () => {
    const rows = {
      "Gestión de avisos": { can_view: true, can_edit: true, can_approve: false, can_delete: false },
      // Reportes es de acceso (solo view): aunque la fila traiga can_edit=true, no cuenta.
      "Reportes": { can_view: true, can_edit: true, can_approve: false, can_delete: false },
    };
    const caps = capabilitiesFor(rows);
    expect(caps).toContainEqual({ module: "Gestión de avisos", action: "Acceder" });
    expect(caps).toContainEqual({ module: "Gestión de avisos", action: "Moderar" });
    expect(caps).toContainEqual({ module: "Reportes", action: "Ver" });
    expect(caps.filter((c) => c.module === "Reportes")).toHaveLength(1);
  });
});
