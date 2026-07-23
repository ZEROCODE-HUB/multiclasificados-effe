// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0073 (fichero REAL) contra un Postgres de verdad.
 *
 * EFFE-044/059/060: `admin_growth_series` ahora devuelve también `avisos`
 * (listings) y `postulaciones` (job_applications) por bucket, además de
 * ingresos y usuarios, para que cada pestaña de reportes grafique su métrica.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0073_growth_series_all_metrics.sql"),
  "utf8",
);

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
    create function public.is_staff(uuid) returns boolean language sql as $$ select true $$;

    create table public.orders            (total numeric, status text, created_at timestamptz default now());
    create table public.profiles          (created_at timestamptz default now());
    create table public.listings          (created_at timestamptz default now());
    create table public.job_applications  (created_at timestamptz default now());

    -- Un dato de cada tipo en el mes actual.
    insert into public.orders (total, status) values (100, 'paid');
    insert into public.orders (total, status) values (999, 'pending');  -- no paga → no cuenta
    insert into public.profiles         default values;
    insert into public.listings         default values;
    insert into public.listings         default values;   -- 2 avisos
    insert into public.job_applications default values;
  `);
  await db.exec(MIGRATION);
});

describe("admin_growth_series — métricas por tipo (EFFE-044/059/060)", () => {
  it("la firma devuelve avisos y postulaciones", async () => {
    const { rows } = await db.query<Record<string, unknown>>(`select * from public.admin_growth_series('6m') limit 1`);
    expect(rows[0]).toHaveProperty("avisos");
    expect(rows[0]).toHaveProperty("postulaciones");
    expect(rows[0]).toHaveProperty("ingresos");
    expect(rows[0]).toHaveProperty("usuarios");
  });

  it("cuenta avisos, postulaciones, usuarios e ingresos pagados del período", async () => {
    const { rows } = await db.query<{ avisos: number; postulaciones: number; usuarios: number; ingresos: number }>(
      `select coalesce(sum(avisos),0)::int as avisos,
              coalesce(sum(postulaciones),0)::int as postulaciones,
              coalesce(sum(usuarios),0)::int as usuarios,
              coalesce(sum(ingresos),0)::numeric as ingresos
         from public.admin_growth_series('6m')`,
    );
    expect(Number(rows[0].avisos)).toBe(2);
    expect(Number(rows[0].postulaciones)).toBe(1);
    expect(Number(rows[0].usuarios)).toBe(1);
    expect(Number(rows[0].ingresos)).toBe(100); // solo el pedido 'paid'
  });

  it("sin sesión de staff no devuelve filas", async () => {
    await db.exec(`create or replace function public.is_staff(uuid) returns boolean language sql as $$ select false $$`);
    const { rows } = await db.query(`select * from public.admin_growth_series('6m')`);
    expect(rows).toHaveLength(0);
    await db.exec(`create or replace function public.is_staff(uuid) returns boolean language sql as $$ select true $$`);
  });
});
