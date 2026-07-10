// @vitest-environment node
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0043 (el fichero REAL, leído de disco) contra un Postgres
 * de verdad en WASM. Las migraciones no se pueden probar con mocks: lo que hay
 * que verificar es que Postgres acepte el SQL y que los datos queden bien.
 *
 * Lo delicado aquí es la PK (user_id, role): reetiquetar 'anunciante' a
 * 'buscador' con un UPDATE plano revienta para quien tenga los dos roles. Por
 * eso la migración borra primero la fila redundante. El primer test fija ese
 * motivo, para que nadie "simplifique" la migración a un solo UPDATE.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0043_consolidate_anunciante_role.sql"),
  "utf8",
);

const U = {
  soloAnunciante:   "00000000-0000-0000-0000-00000000000a",
  ambosRoles:       "00000000-0000-0000-0000-00000000000b", // 'anunciante' + 'buscador'
  anuncianteYAdmin: "00000000-0000-0000-0000-00000000000c",
  soloBuscador:     "00000000-0000-0000-0000-00000000000d",
  soloAdmin:        "00000000-0000-0000-0000-00000000000e",
};

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // Esquema mínimo, copiado de 0001_enums.sql y 0002_core_tables.sql.
  await db.exec(`
    create type public.app_role as enum ('anunciante','buscador','admin','superadmin','moderador','soporte');
    create table public.profiles (id uuid primary key);
    create table public.user_roles (
      user_id uuid not null references public.profiles(id) on delete cascade,
      role    public.app_role not null,
      primary key (user_id, role)
    );
  `);
});

beforeEach(async () => {
  await db.exec(`delete from public.user_roles; delete from public.profiles;`);
  await db.exec(`insert into public.profiles(id) values ${Object.values(U).map((id) => `('${id}')`).join(",")};`);
  await db.exec(`
    insert into public.user_roles(user_id, role) values
      ('${U.soloAnunciante}','anunciante'),
      ('${U.ambosRoles}','anunciante'), ('${U.ambosRoles}','buscador'),
      ('${U.anuncianteYAdmin}','anunciante'), ('${U.anuncianteYAdmin}','admin'),
      ('${U.soloBuscador}','buscador'),
      ('${U.soloAdmin}','admin');
  `);
});

const rolesDe = async (id: string) => {
  const r = await db.query<{ role: string }>(
    `select role from public.user_roles where user_id=$1 order by role::text`, [id],
  );
  return r.rows.map((x) => x.role);
};
const contar = async (where = "true") =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from public.user_roles where ${where}`)).rows[0].n);

describe("migración 0043 — consolida 'anunciante' en 'buscador'", () => {
  it("un UPDATE plano violaría la PK: por eso hay que borrar el duplicado primero", async () => {
    await expect(
      db.exec(`update public.user_roles set role='buscador' where role='anunciante';`),
    ).rejects.toThrow(/duplicate key|user_roles_pkey/i);
  });

  it("reetiqueta a quien solo tenía 'anunciante'", async () => {
    await db.exec(MIGRATION);
    expect(await rolesDe(U.soloAnunciante)).toEqual(["buscador"]);
  });

  it("colapsa a una sola fila a quien tenía ambos roles", async () => {
    await db.exec(MIGRATION);
    expect(await rolesDe(U.ambosRoles)).toEqual(["buscador"]);
  });

  it("conserva los demás roles del usuario", async () => {
    await db.exec(MIGRATION);
    expect(await rolesDe(U.anuncianteYAdmin)).toEqual(["admin", "buscador"]);
    expect(await rolesDe(U.soloBuscador)).toEqual(["buscador"]);
    expect(await rolesDe(U.soloAdmin)).toEqual(["admin"]);
  });

  it("no deja ninguna fila 'anunciante' y solo elimina la duplicada", async () => {
    expect(await contar("role='anunciante'")).toBe(3);
    expect(await contar()).toBe(7);

    await db.exec(MIGRATION);

    expect(await contar("role='anunciante'")).toBe(0);
    expect(await contar()).toBe(6); // 7 menos la fila redundante de `ambosRoles`
  });

  it("es idempotente: correrla dos veces deja la tabla igual", async () => {
    await db.exec(MIGRATION);
    const antes = (await db.query(`select user_id, role from public.user_roles order by user_id, role::text`)).rows;

    await db.exec(MIGRATION);
    const despues = (await db.query(`select user_id, role from public.user_roles order by user_id, role::text`)).rows;

    expect(despues).toEqual(antes);
  });

  it("sobre una base ya limpia no hace nada", async () => {
    await db.exec(`delete from public.user_roles where role='anunciante';`);
    const antes = await contar();

    await db.exec(MIGRATION);

    expect(await contar()).toBe(antes);
  });
});
