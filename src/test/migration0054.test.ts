// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0054 (fichero REAL) contra un Postgres de verdad.
 *
 * `get_app_version_info()` traduce las claves de system_settings a un jsonb que
 * la app usa para decidir si obliga/sugiere actualizar. Debe funcionar tanto si
 * el número se guardó como number (12) como si se guardó como string ("12").
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0054_app_version_check.sql"),
  "utf8",
);

let db: PGlite;

const info = async () => {
  const { rows } = await db.query<{ v: Record<string, unknown> }>(`select public.get_app_version_info() as v`);
  return rows[0].v;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create table public.system_settings (
      key text primary key,
      value jsonb not null default '{}'::jsonb,
      label text,
      updated_at timestamptz not null default now()
    );
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  // Volver a la semilla de la migración entre pruebas.
  await db.exec(`delete from public.system_settings;`);
  await db.exec(MIGRATION);
});

describe("get_app_version_info", () => {
  it("devuelve la semilla por defecto (build actual 10)", async () => {
    const v = await info();
    expect(v.latest_build).toBe(10);
    expect(v.min_build).toBe(1);
    expect(v.version_name).toBe("1.9");
    expect(String(v.download_url)).toContain("releases");
  });

  it("refleja un versionCode nuevo guardado como número", async () => {
    await db.exec(`update public.system_settings set value = '12'::jsonb where key = 'app_latest_build';`);
    expect((await info()).latest_build).toBe(12);
  });

  it("también acepta el número guardado como texto", async () => {
    await db.exec(`update public.system_settings set value = '"15"'::jsonb where key = 'app_latest_build';`);
    expect((await info()).latest_build).toBe(15);
  });

  it("expone los campos de OTA (vacíos por defecto)", async () => {
    const v = await info();
    expect(v.ota_version).toBe("");
    expect(v.ota_url).toBe("");
  });
});
