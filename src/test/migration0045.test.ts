// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0045 (el fichero REAL) contra un Postgres de verdad.
 *
 * Lo delicado es el jsonb: `set_setting` guarda lo que le manda el cliente, así
 * que el interruptor puede llegar como boolean `true` o como string `"true"`.
 * Si la función solo contemplara uno de los dos, el mantenimiento quedaría
 * apagado justo cuando el admin cree haberlo encendido.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0045_maintenance_mode.sql"),
  "utf8",
);

let db: PGlite;

const poner = async (valueSql: string) =>
  db.exec(`delete from public.system_settings;
           insert into public.system_settings (key, value) values ('maintenance_mode', ${valueSql});`);

const activo = async () => {
  const { rows } = await db.query<{ on: boolean }>("select public.is_maintenance_mode() as on");
  return rows[0].on;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.system_settings (key text primary key, value jsonb, label text);
  `);
  await db.exec(MIGRATION);
});

beforeEach(() => db.exec("delete from public.system_settings;"));

describe("is_maintenance_mode", () => {
  it("sin la fila, el mantenimiento está apagado", async () => {
    expect(await activo()).toBe(false);
  });

  it("boolean true lo enciende", async () => {
    await poner("'true'::jsonb");
    expect(await activo()).toBe(true);
  });

  it("boolean false lo deja apagado", async () => {
    await poner("'false'::jsonb");
    expect(await activo()).toBe(false);
  });

  it('el string "true" también lo enciende', async () => {
    await poner(`'"true"'::jsonb`);
    expect(await activo()).toBe(true);
  });

  it('el string "false" no lo enciende', async () => {
    await poner(`'"false"'::jsonb`);
    expect(await activo()).toBe(false);
  });

  it("un valor absurdo no lo enciende ni revienta", async () => {
    await poner("'42'::jsonb");
    expect(await activo()).toBe(false);
    await poner("'null'::jsonb");
    expect(await activo()).toBe(false);
  });

  it("anon puede ejecutarla: un visitante sin sesión debe poder saberlo", async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.is_maintenance_mode()', 'execute') as ok",
    );
    expect(rows[0].ok).toBe(true);
  });

  it("es idempotente: volver a aplicarla no falla", async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });
});
