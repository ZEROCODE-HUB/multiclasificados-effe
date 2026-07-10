// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * La 0047 corrige la matriz de Moderador y Soporte. Se corre el .sql REAL contra
 * un Postgres de verdad, partiendo del estado incoherente que había en
 * producción: soporte podía BORRAR avisos sin poder editarlos.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0047_matriz_moderador_soporte.sql"),
  "utf8",
);

let db: PGlite;

const perm = async (role: string, module: string) => {
  const { rows } = await db.query<Record<string, boolean>>(
    `select can_view, can_edit, can_approve, can_delete
       from public.role_permissions where role = $1 and module = $2`,
    [role, module],
  );
  return rows[0];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.role_permissions (
      role text not null, module text not null,
      can_view boolean not null default false, can_edit boolean not null default false,
      can_approve boolean not null default false, can_delete boolean not null default false,
      primary key (role, module)
    );
    -- El estado real de producción antes de esta migración.
    insert into public.role_permissions values
      ('soporte', 'Gestión de avisos',       true, false, false, true),
      ('soporte', 'Configuración comercial', true, false, false, false),
      ('moderador', 'Auditoría y logs',      true, false, false, false),
      ('admin', 'Gestión de usuarios',       true, true,  true,  false);
  `);
  await db.exec(MIGRATION);
});

describe("Soporte: solo lectura", () => {
  it("deja de poder borrar avisos, que era el permiso incoherente", async () => {
    expect(await perm("soporte", "Gestión de avisos")).toEqual({
      can_view: true, can_edit: false, can_approve: false, can_delete: false,
    });
  });

  it("no escribe en ningún módulo", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.role_permissions
        where role = 'soporte' and (can_edit or can_approve or can_delete)`,
    );
    expect(rows[0].n).toBe("0");
  });

  it("ve lo que necesita para atender a un usuario, incluida la facturación", async () => {
    for (const m of ["Gestión de usuarios", "Gestión de avisos", "Conversaciones reportadas", "Reportes", "Pagos y planes"]) {
      expect((await perm("soporte", m)).can_view).toBe(true);
    }
  });

  it("no ve la configuración comercial ni la auditoría", async () => {
    expect((await perm("soporte", "Configuración comercial")).can_view).toBe(false);
    expect((await perm("soporte", "Auditoría y logs")).can_view).toBe(false);
  });
});

describe("Moderador: modera, y solo eso", () => {
  it("escribe en avisos, usuarios y denuncias", async () => {
    expect((await perm("moderador", "Gestión de avisos")).can_edit).toBe(true);
    expect((await perm("moderador", "Gestión de usuarios")).can_edit).toBe(true);
    expect((await perm("moderador", "Conversaciones reportadas")).can_edit).toBe(true);
  });

  it("no verifica identidades: eso es 'aprobar' en usuarios", async () => {
    expect((await perm("moderador", "Gestión de usuarios")).can_approve).toBe(false);
  });

  it("no toca precios ni comisiones, y ya no ve la auditoría", async () => {
    expect((await perm("moderador", "Configuración comercial")).can_view).toBe(false);
    expect((await perm("moderador", "Auditoría y logs")).can_view).toBe(false);
  });

  it("no borra nada", async () => {
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.role_permissions where role = 'moderador' and can_delete`,
    );
    expect(rows[0].n).toBe("0");
  });
});

describe("efectos colaterales", () => {
  it("no toca al admin", async () => {
    expect(await perm("admin", "Gestión de usuarios")).toEqual({
      can_view: true, can_edit: true, can_approve: true, can_delete: false,
    });
  });

  it("deja exactamente 8 módulos por rol", async () => {
    const { rows } = await db.query<{ role: string; n: string }>(
      `select role, count(*)::text as n from public.role_permissions
        where role in ('moderador','soporte') group by role order by role`,
    );
    expect(rows).toEqual([{ role: "moderador", n: "8" }, { role: "soporte", n: "8" }]);
  });

  it("es idempotente", async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
    expect((await perm("soporte", "Gestión de avisos")).can_delete).toBe(false);
  });
});
