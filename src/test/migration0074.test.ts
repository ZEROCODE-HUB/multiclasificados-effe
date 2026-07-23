// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0074 (fichero REAL) contra un Postgres de verdad.
 *
 * EFFE-054: admin_credit_transactions lista las transacciones de crédito de
 * TODOS los usuarios (nombre/correo + aviso), con búsqueda, filtro de fechas y
 * paginación (total_count), y solo si has_perm('Reportes','edit') es true.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0074_admin_credit_transactions.sql"),
  "utf8",
);

let db: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    set time zone 'UTC';
    create role anon; create role authenticated;
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql as $$ select '${U1}'::uuid $$;
    -- has_perm de prueba, controlable por una variable de sesión.
    create function public.has_perm(text, text) returns boolean language sql stable
      as $$ select coalesce(current_setting('test.perm', true), 'true') = 'true' $$;

    create table public.profiles (id uuid primary key, full_name text, email text);
    create table public.listings (id uuid primary key, title text);
    create table public.credit_transactions (
      id uuid primary key, user_id uuid, type text, credits numeric,
      description text, listing_id uuid, created_at timestamptz
    );

    insert into public.profiles values
      ('${U1}', 'Ana Pérez', 'ana@example.com'),
      ('${U2}', 'Beto Ruiz', 'beto@example.com');
    insert into public.listings values ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Casa en Lima');
    insert into public.credit_transactions (id, user_id, type, credits, description, listing_id, created_at) values
      ('c0000000-0000-0000-0000-000000000001', '${U1}', 'purchase',  100, 'Compra de saldo',  null,                                    '2026-07-20T10:00:00Z'),
      ('c0000000-0000-0000-0000-000000000002', '${U1}', 'spend',     -16, 'Publicar aviso',   'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-07-21T10:00:00Z'),
      ('c0000000-0000-0000-0000-000000000003', '${U2}', 'purchase',   50, 'Compra de saldo',  null,                                    '2026-07-10T10:00:00Z');
  `);
  await db.exec(MIGRATION);
});

beforeEach(() => db.exec("set test.perm = 'true';"));

const call = (args: string) =>
  db.query<Record<string, unknown>>(`select * from public.admin_credit_transactions(${args})`);

describe("admin_credit_transactions (EFFE-054)", () => {
  it("lista todas con nombre/correo y total_count, ordenadas por fecha desc", async () => {
    const { rows } = await call("null, null, null, 20, 0");
    expect(rows).toHaveLength(3);
    expect(Number(rows[0].total_count)).toBe(3);
    expect(rows[0]).toMatchObject({ full_name: "Ana Pérez", email: "ana@example.com", type: "spend" }); // la más reciente
  });

  it("busca por usuario o correo", async () => {
    const { rows } = await call("'beto', null, null, 20, 0");
    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe("Beto Ruiz");
  });

  it("filtra por rango de fechas (incluye el día 'hasta' completo)", async () => {
    const { rows } = await call("null, '2026-07-20', '2026-07-20', 20, 0");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("c0000000-0000-0000-0000-000000000001");
  });

  it("pagina con limit/offset y conserva el total", async () => {
    const p1 = await call("null, null, null, 2, 0");
    expect(p1.rows).toHaveLength(2);
    expect(Number(p1.rows[0].total_count)).toBe(3);
    const p2 = await call("null, null, null, 2, 2");
    expect(p2.rows).toHaveLength(1);
  });

  it("trae el título del aviso relacionado en un gasto", async () => {
    const { rows } = await call("'ana', null, null, 20, 0");
    const spend = rows.find((r) => r.type === "spend");
    expect(spend?.listing_title).toBe("Casa en Lima");
  });

  it("sin permiso (has_perm=false) no devuelve nada", async () => {
    await db.exec("set test.perm = 'false';");
    const { rows } = await call("null, null, null, 20, 0");
    expect(rows).toHaveLength(0);
  });
});
