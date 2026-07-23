// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0075 (fichero REAL) contra un Postgres de verdad.
 *
 * EFFE-054 (mejora): admin_credit_transactions ahora acepta p_type
 * ('purchase'|'spend'|null) para filtrar el historial por tipo de transacción,
 * conservando el resto de filtros, la paginación y el gate de permiso.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0075_credit_tx_type_filter.sql"),
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
    create function public.has_perm(text, text) returns boolean language sql stable
      as $$ select coalesce(current_setting('test.perm', true), 'true') = 'true' $$;

    create table public.profiles (id uuid primary key, full_name text, email text);
    create table public.listings (id uuid primary key, title text);
    create table public.credit_transactions (
      id uuid primary key, user_id uuid, type text, credits numeric,
      description text, listing_id uuid, created_at timestamptz
    );

    insert into public.profiles values ('${U1}', 'Ana Pérez', 'ana@example.com'), ('${U2}', 'Beto Ruiz', 'beto@example.com');
    insert into public.credit_transactions (id, user_id, type, credits, description, listing_id, created_at) values
      ('c0000000-0000-0000-0000-000000000001', '${U1}', 'purchase',  100, 'Compra de saldo', null, '2026-07-20T10:00:00Z'),
      ('c0000000-0000-0000-0000-000000000002', '${U1}', 'spend',     -16, 'Publicar aviso',  null, '2026-07-21T10:00:00Z'),
      ('c0000000-0000-0000-0000-000000000003', '${U2}', 'purchase',   50, 'Compra de saldo', null, '2026-07-10T10:00:00Z');
  `);
  await db.exec(MIGRATION); // el `drop if exists` de la 5-arg es no-op aquí
});

beforeEach(() => db.exec("set test.perm = 'true';"));

// firma nueva: (p_search, p_type, p_from, p_to, p_limit, p_offset)
const call = (args: string) =>
  db.query<Record<string, unknown>>(`select * from public.admin_credit_transactions(${args})`);

describe("admin_credit_transactions — filtro por tipo (EFFE-054)", () => {
  it("sin tipo devuelve todas", async () => {
    const { rows } = await call("null, null, null, null, 20, 0");
    expect(rows).toHaveLength(3);
  });

  it("p_type='purchase' devuelve solo compras", async () => {
    const { rows } = await call("null, 'purchase', null, null, 20, 0");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.type === "purchase")).toBe(true);
  });

  it("p_type='spend' devuelve solo gastos", async () => {
    const { rows } = await call("null, 'spend', null, null, 20, 0");
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("spend");
  });

  it("tipo + búsqueda por usuario combinan", async () => {
    const { rows } = await call("'ana', 'purchase', null, null, 20, 0");
    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe("Ana Pérez");
  });

  it("sin permiso (has_perm=false) no devuelve nada", async () => {
    await db.exec("set test.perm = 'false';");
    const { rows } = await call("null, 'purchase', null, null, 20, 0");
    expect(rows).toHaveLength(0);
  });
});
