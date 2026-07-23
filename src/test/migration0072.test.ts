// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0072 (fichero REAL) contra un Postgres de verdad.
 *
 * EFFE-036: `publish_listing` ahora acepta también avisos 'expired' (republicar
 * un vencido), pero NO 'active'/'paused' (sería extensión de vigencia gratis)
 * ni 'rejected'/'sold'. El dueño se comprueba de forma explícita.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0072_republish_listing.sql"),
  "utf8",
);

let db: PGlite;
const OWNER = "11111111-1111-1111-1111-111111111111";

const seed = async (id: string, status: string) => {
  await db.exec(`
    insert into public.listings (id, owner_id, status, plan_extras)
    values ('${id}', '${OWNER}', '${status}', '{}'::jsonb);
  `);
};

const rowOf = async (id: string) => {
  const { rows } = await db.query<{ status: string; expires_at: string | null }>(
    `select status, expires_at from public.listings where id = '${id}'`,
  );
  return rows[0];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql as $$ select '${OWNER}'::uuid $$;
    create function public.is_staff(uuid) returns boolean language sql as $$ select false $$;

    create table public.listings (
      id uuid primary key, owner_id uuid, status text default 'draft',
      published_at timestamptz, expires_at timestamptz,
      featured boolean not null default false,
      urgent boolean not null default false,
      confidential boolean not null default false,
      plan_extras jsonb not null default '{}'::jsonb
    );
  `);
  await db.exec(MIGRATION);
});

beforeEach(() => db.exec("delete from public.listings;"));

describe("publish_listing — republicar (EFFE-036)", () => {
  it("republica un aviso VENCIDO: pasa a active con nueva vigencia", async () => {
    await seed("aaaaaaaa-0000-0000-0000-000000000001", "expired");
    await db.query(`select public.publish_listing('aaaaaaaa-0000-0000-0000-000000000001', 7)`);
    const r = await rowOf("aaaaaaaa-0000-0000-0000-000000000001");
    expect(r.status).toBe("active");
    expect(new Date(r.expires_at!).getTime()).toBeGreaterThan(Date.now());
  });

  it("sigue publicando un BORRADOR", async () => {
    await seed("aaaaaaaa-0000-0000-0000-000000000002", "draft");
    await db.query(`select public.publish_listing('aaaaaaaa-0000-0000-0000-000000000002', 15)`);
    expect((await rowOf("aaaaaaaa-0000-0000-0000-000000000002")).status).toBe("active");
  });

  it("NO republica un aviso ACTIVO (evita extensión gratis)", async () => {
    await seed("aaaaaaaa-0000-0000-0000-000000000003", "active");
    await expect(
      db.query(`select public.publish_listing('aaaaaaaa-0000-0000-0000-000000000003', 7)`),
    ).rejects.toThrow();
  });

  it("NO republica un aviso PAUSADO", async () => {
    await seed("aaaaaaaa-0000-0000-0000-000000000004", "paused");
    await expect(
      db.query(`select public.publish_listing('aaaaaaaa-0000-0000-0000-000000000004', 7)`),
    ).rejects.toThrow();
  });

  it("NO republica un aviso RECHAZADO (saltaría la moderación)", async () => {
    await seed("aaaaaaaa-0000-0000-0000-000000000005", "rejected");
    await expect(
      db.query(`select public.publish_listing('aaaaaaaa-0000-0000-0000-000000000005', 7)`),
    ).rejects.toThrow();
  });

  it("rechaza duraciones inválidas", async () => {
    await seed("aaaaaaaa-0000-0000-0000-000000000006", "expired");
    await expect(
      db.query(`select public.publish_listing('aaaaaaaa-0000-0000-0000-000000000006', 0)`),
    ).rejects.toThrow();
  });
});
