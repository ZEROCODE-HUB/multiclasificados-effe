// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0056 (el fichero REAL) contra un Postgres de verdad.
 *
 * Herramienta de PRUEBA (superadmin): mover la fecha de publicación de un aviso
 * para testear su caducidad. Lo que hay que garantizar:
 *   - solo staff puede llamarla (guard is_staff);
 *   - conserva la duración configurada del aviso y recalcula expires_at;
 *   - reevalúa el estado al instante: active <-> expired según la nueva vigencia;
 *   - NO toca avisos que no están publicados (draft/rechazado/vendido);
 *   - deja rastro en auditoría.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0056_admin_test_listing_dates.sql"),
  "utf8",
);

let db: PGlite;

const STAFF = "b4d340da-2979-439f-bad1-2160d9b533e9";
const OWNER = "11111111-1111-1111-1111-111111111111";

// Fija quién es el "usuario autenticado" (auth.uid) para las siguientes queries.
const actuar = (uid: string | null) =>
  db.exec(`select set_config('test.uid', ${uid === null ? "''" : `'${uid}'`}, false);`);

// Inserta un aviso con published_at y expires_at relativos a ahora (en días).
const seedListing = (id: string, status: string, pubDias: number, venceDias: number) =>
  db.exec(`
    insert into public.listings (id, owner_id, title, status, published_at, expires_at)
    values ('${id}', '${OWNER}', 'Aviso ${id}', '${status}',
            now() + interval '${pubDias} days', now() + interval '${venceDias} days');
  `);

const setDate = async (id: string, expr: string) => {
  const { rows } = await db.query<{ status: string; published_at: string; expires_at: string }>(
    `select status, published_at, expires_at
     from public.admin_set_listing_published('${id}'::uuid, ${expr})`,
  );
  return rows[0];
};

const listing = async (id: string) => {
  const { rows } = await db.query<{ status: string; created_at: string; expiry_notified_at: string | null; dur_days: number }>(
    `select status::text, created_at, expiry_notified_at,
            extract(epoch from (expires_at - published_at)) / 86400 as dur_days
     from public.listings where id = '${id}'`,
  );
  return rows[0];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create type public.listing_status as enum
      ('draft','pending','active','paused','expired','rejected','sold');

    create table public.profiles (id uuid primary key, full_name text);

    create table public.listings (
      id uuid primary key,
      owner_id uuid,
      title text,
      status public.listing_status not null default 'draft',
      category_id text default 'vehiculos',
      price numeric default 0,
      currency text default 'PEN',
      views int default 0,
      featured boolean not null default false,
      published_at timestamptz,
      expires_at timestamptz,
      plan_duration_days int,
      expiry_notified_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table public.audit_logs (
      id uuid primary key default gen_random_uuid(),
      action text, entity_type text, entity_id text, meta jsonb,
      created_at timestamptz not null default now()
    );

    -- auth.uid() de prueba: lee el GUC 'test.uid' que fija actuar().
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid;
    $$;

    -- is_staff real (simplificado): solo el usuario STAFF es staff.
    create function public.is_staff(_uid uuid) returns boolean language sql stable as $$
      select coalesce(_uid = '${STAFF}'::uuid, false);
    $$;

    -- log_audit compatible con la firma usada por la migración.
    create function public.log_audit(p_action text, p_entity_type text, p_entity_id text, p_meta jsonb)
    returns void language sql as $$
      insert into public.audit_logs (action, entity_type, entity_id, meta)
      values (p_action, p_entity_type, p_entity_id, p_meta);
    $$;

    insert into public.profiles (id, full_name) values ('${OWNER}', 'Dueño');
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec("delete from public.audit_logs; delete from public.listings;");
  await actuar(STAFF);
});

describe("admin_set_listing_published", () => {
  it("rechaza a quien no es staff", async () => {
    await seedListing("aaaaaaaa-0000-0000-0000-000000000001", "active", -2, 5);
    await actuar(OWNER); // el dueño no es staff
    await expect(
      setDate("aaaaaaaa-0000-0000-0000-000000000001", "now()"),
    ).rejects.toThrow(/No autorizado/);
  });

  it("mover la publicación al pasado deja el aviso VENCIDO", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000002";
    await seedListing(id, "active", -2, 5); // duración 7 días, hoy vigente
    const r = await setDate(id, "now() - interval '8 days'");
    expect(r.status).toBe("expired");
    // La nueva vigencia (pub + 7d) quedó en el pasado.
    expect(new Date(r.expires_at).getTime()).toBeLessThan(Date.now());
  });

  it("republicar 'ahora' reactiva un aviso vencido", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000003";
    await seedListing(id, "expired", -10, -3); // duración 7 días, ya vencido
    const r = await setDate(id, "now()");
    expect(r.status).toBe("active");
    expect(new Date(r.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("conserva la duración configurada del aviso (7 días)", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000004";
    await seedListing(id, "active", -2, 5); // 7 días de diferencia
    await setDate(id, "now() - interval '100 days'");
    const l = await listing(id);
    expect(Math.round(l.dur_days)).toBe(7);
    expect(l.created_at).not.toBeNull(); // también movió created_at
  });

  it("resetea expiry_notified_at para poder volver a avisar", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000005";
    await seedListing(id, "active", -2, 5);
    await db.exec(`update public.listings set expiry_notified_at = now() where id = '${id}'`);
    await setDate(id, "now()");
    expect((await listing(id)).expiry_notified_at).toBeNull();
  });

  it("NO republica un borrador (solo toca active/expired)", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000006";
    await seedListing(id, "draft", 0, 30);
    const r = await setDate(id, "now() - interval '60 days'");
    expect(r.status).toBe("draft");
  });

  it("NO reactiva un aviso rechazado ni uno vendido", async () => {
    await seedListing("aaaaaaaa-0000-0000-0000-000000000007", "rejected", -2, 5);
    await seedListing("aaaaaaaa-0000-0000-0000-000000000008", "sold", -2, 5);
    expect((await setDate("aaaaaaaa-0000-0000-0000-000000000007", "now()")).status).toBe("rejected");
    expect((await setDate("aaaaaaaa-0000-0000-0000-000000000008", "now()")).status).toBe("sold");
  });

  it("deja rastro en auditoría", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000009";
    await seedListing(id, "active", -2, 5);
    await setDate(id, "now() - interval '8 days'");
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.audit_logs
       where action = 'test_set_listing_published' and entity_id = '${id}'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("falla si el aviso no existe", async () => {
    await expect(
      setDate("aaaaaaaa-0000-0000-0000-0000000000ff", "now()"),
    ).rejects.toThrow(/Aviso no encontrado/);
  });
});

describe("admin_list_listings ahora expone published_at y expires_at", () => {
  it("devuelve las columnas de vigencia para el panel", async () => {
    const id = "bbbbbbbb-0000-0000-0000-000000000001";
    await seedListing(id, "active", -2, 5);
    await actuar(STAFF);
    const { rows } = await db.query<{ published_at: string | null; expires_at: string | null }>(
      "select published_at, expires_at from public.admin_list_listings(null, null, 100, 0)",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].published_at).not.toBeNull();
    expect(rows[0].expires_at).not.toBeNull();
  });
});
