// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre 0066 encima de 0046. admin_grant_credits ("Otorgar saldo") pasa de
 * is_staff a has_perm('Gestión de usuarios','edit'): admin/moderador conservan
 * la acción (seed edit=true en usuarios), soporte la pierde, y el saldo se
 * acumula correctamente. También cubre que el saldo suma en múltiples otorgues.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0046 = read("0046_roles_permissions_enforced.sql");
const MIG_0066 = read("0066_grant_credits_matrix.sql");

const U = {
  superadmin: "00000000-0000-0000-0000-0000000000a1",
  admin:      "00000000-0000-0000-0000-0000000000a2",
  moderador:  "00000000-0000-0000-0000-0000000000a3",
  soporte:    "00000000-0000-0000-0000-0000000000a4",
};
const CLIENTE = "00000000-0000-0000-0000-0000000000d9";

let db: PGlite;
const como = (uid: string) => db.exec(`set test.uid = '${uid}';`);
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const saldo = () =>
  q<{ balance: string | null }>(`select balance::text as balance from public.user_credits where user_id = '${CLIENTE}'`)
    .then((r) => (r.length ? r[0].balance : null));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid $$;

    create type public.app_role as enum ('anunciante','buscador','admin','superadmin','moderador','soporte');
    create type public.listing_status as enum ('draft','pending','active','paused','rejected','expired','sold');

    create table public.profiles (id uuid primary key, full_name text, status text default 'active',
                                  verified boolean default false, ban_reason text, suspended_until timestamptz);
    create table public.user_roles (user_id uuid, role public.app_role, primary key (user_id, role));
    create table public.role_permissions (
      role text not null, module text not null,
      can_view boolean not null default false, can_edit boolean not null default false,
      can_approve boolean not null default false, can_delete boolean not null default false,
      primary key (role, module)
    );
    create table public.listings (
      id uuid primary key, owner_id uuid, title text, description text, price numeric,
      currency text, condition text, category_id text, subcategory_id text, location text,
      status public.listing_status, featured boolean default false, urgent boolean default false,
      views int default 0, rejection_reason text, published_at timestamptz, created_at timestamptz default now()
    );
    create table public.listing_images (listing_id uuid, url text, sort_order int);
    create table public.reports (
      id uuid primary key, target_user_id uuid, listing_id uuid, reason text,
      status text default 'open', action_taken text, resolution_note text,
      resolved_by uuid, resolved_at timestamptz
    );
    -- audit_logs con las columnas que usa admin_grant_credits (y el stub log_audit).
    create table public.audit_logs (
      id serial primary key, actor_id uuid, action text, entity_type text,
      entity_id uuid, metadata jsonb, created_at timestamptz default now()
    );
    -- Tablas de saldo que toca admin_grant_credits.
    create table public.user_credits (user_id uuid primary key, balance numeric default 0, updated_at timestamptz);
    create table public.credit_transactions (
      id serial primary key, user_id uuid, type text, credits numeric, description text, created_at timestamptz default now()
    );

    create function public.has_role(_uid uuid, _role text) returns boolean
      language sql stable as $$
        select exists (select 1 from public.user_roles r where r.user_id = _uid and r.role::text = _role) $$;
    create function public.is_staff(_uid uuid) returns boolean language sql stable as $$ select false $$;
    create function public.log_audit(a text, b text, c text, d jsonb) returns void
      language sql as $$ insert into public.audit_logs (action) values (a) $$;
    create function public.notify_user(a uuid, b text, c text, d jsonb) returns void
      language sql as $$ select $$;
  `);

  await db.exec(`
    insert into public.profiles (id) values
      ('${U.superadmin}'), ('${U.admin}'), ('${U.moderador}'), ('${U.soporte}'), ('${CLIENTE}');
    insert into public.user_roles values
      ('${U.superadmin}', 'superadmin'), ('${U.admin}', 'admin'),
      ('${U.moderador}', 'moderador'), ('${U.soporte}', 'soporte');
  `);

  await db.exec(MIG_0046);
  await db.exec(MIG_0066);
});

beforeEach(() => db.exec(`delete from public.user_credits; delete from public.credit_transactions;`));

describe("admin_grant_credits honra la matriz (0066)", () => {
  it("soporte NO puede otorgar saldo: no tiene 'editar' en usuarios", async () => {
    await como(U.soporte);
    await expect(q(`select public.admin_grant_credits('${CLIENTE}', 50, 'x')`)).rejects.toThrow(/no tienes permiso/);
    expect(await saldo()).toBeNull();
  });

  it("admin otorga y devuelve el saldo nuevo; acumula en un segundo otorgue", async () => {
    await como(U.admin);
    const [r1] = await q<{ bal: string }>(`select public.admin_grant_credits('${CLIENTE}', 50, 'bono') as bal`);
    expect(r1.bal).toBe("50");
    const [r2] = await q<{ bal: string }>(`select public.admin_grant_credits('${CLIENTE}', 30, 'extra') as bal`);
    expect(r2.bal).toBe("80"); // acumula sobre el saldo previo
    const [t] = await q<{ n: string }>(`select count(*)::text as n from public.credit_transactions where user_id = '${CLIENTE}'`);
    expect(t.n).toBe("2");
  });

  it("moderador también puede (seed: edit=true en usuarios)", async () => {
    await como(U.moderador);
    const [r] = await q<{ bal: string }>(`select public.admin_grant_credits('${CLIENTE}', 15, null) as bal`);
    expect(r.bal).toBe("15");
  });

  it("el superadmin puede siempre; una cantidad <= 0 es un error", async () => {
    await como(U.superadmin);
    await q(`select public.admin_grant_credits('${CLIENTE}', 100, null)`);
    expect(await saldo()).toBe("100");
    await expect(q(`select public.admin_grant_credits('${CLIENTE}', 0, null)`)).rejects.toThrow(/mayor a 0/);
  });
});
