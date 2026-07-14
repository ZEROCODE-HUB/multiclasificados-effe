// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0058 (fichero REAL) contra un Postgres de verdad.
 *
 * Añade `condition_enabled` a `categories`. Debe: (1) crear la columna con
 * default true (categorías existentes conservan la condición), y (2) apagarla
 * en Servicios y Empleos, donde vender "nuevo/usado" no aplica.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0058_category_condition_enabled.sql"),
  "utf8",
);

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.categories (
      id text primary key,
      name text not null,
      icon text,
      sort_order int,
      active boolean not null default true
    );
    insert into public.categories (id, name, sort_order) values
      ('inmuebles','Inmuebles',1),
      ('vehiculos','Vehículos, Maquinarias y Equipos',2),
      ('empleos','Empleos',3),
      ('servicios','Servicios',4);
  `);
  await db.exec(MIGRATION);
});

const enabled = async (id: string) => {
  const { rows } = await db.query<{ condition_enabled: boolean }>(
    `select condition_enabled from public.categories where id = $1`, [id],
  );
  return rows[0]?.condition_enabled;
};

describe("0058 — condition_enabled por categoría", () => {
  it("crea la columna con default true (categorías normales conservan la condición)", async () => {
    expect(await enabled("inmuebles")).toBe(true);
    expect(await enabled("vehiculos")).toBe(true);
  });

  it("apaga la condición en Servicios y Empleos", async () => {
    expect(await enabled("servicios")).toBe(false);
    expect(await enabled("empleos")).toBe(false);
  });

  it("es idempotente: correrla dos veces no falla ni cambia el resultado", async () => {
    await db.exec(MIGRATION);
    expect(await enabled("servicios")).toBe(false);
    expect(await enabled("inmuebles")).toBe(true);
  });
});
