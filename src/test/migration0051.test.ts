// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0051 (el fichero REAL) contra un Postgres de verdad.
 *
 * Al publicar, las insignias (featured/urgent/confidential) deben encenderse
 * SOLO si el anunciante pagó el adicional correspondiente (plan_extras). Si no
 * lo pagó, quedan apagadas. Un despiste aquí daría avisos "destacados" gratis.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0051_listing_badges_on_publish.sql"),
  "utf8",
);

let db: PGlite;
const OWNER = "11111111-1111-1111-1111-111111111111";

// Publica un aviso recién creado con los extras dados y devuelve sus banderas.
const publishWith = async (id: string, extras: Record<string, number>) => {
  await db.exec(`
    insert into public.listings (id, owner_id, status, plan_extras)
    values ('${id}', '${OWNER}', 'draft', '${JSON.stringify(extras)}'::jsonb);
  `);
  await db.query(`select public.publish_listing('${id}', 7)`);
  const { rows } = await db.query<{ status: string; featured: boolean; urgent: boolean; confidential: boolean }>(
    `select status, featured, urgent, confidential from public.listings where id = '${id}'`,
  );
  return rows[0];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    -- auth.uid()/is_staff usados por publish_listing; en el test somos el dueño.
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

describe("publish_listing — insignias según lo pagado", () => {
  it("sin adicionales, ninguna insignia se enciende", async () => {
    const r = await publishWith("aaaaaaaa-0000-0000-0000-000000000001", {});
    expect(r.status).toBe("active");
    expect(r).toMatchObject({ featured: false, urgent: false, confidential: false });
  });

  it("'destacado' enciende featured; 'urgente' enciende urgent", async () => {
    const r = await publishWith("aaaaaaaa-0000-0000-0000-000000000002", { destacado: 1, urgente: 1 });
    expect(r).toMatchObject({ featured: true, urgent: true, confidential: false });
  });

  it("'confidencial' enciende confidential", async () => {
    const r = await publishWith("aaaaaaaa-0000-0000-0000-000000000003", { confidencial: 1 });
    expect(r).toMatchObject({ featured: false, urgent: false, confidential: true });
  });

  it("una cantidad mayor a 1 también cuenta como activo", async () => {
    const r = await publishWith("aaaaaaaa-0000-0000-0000-000000000004", { destacado: 3 });
    expect(r.featured).toBe(true);
  });

  it("los adicionales que no son insignia (img/pdf) no encienden nada", async () => {
    const r = await publishWith("aaaaaaaa-0000-0000-0000-000000000005", { img500: 2, pdf500: 1 });
    expect(r).toMatchObject({ featured: false, urgent: false, confidential: false });
  });
});
