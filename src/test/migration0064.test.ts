// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre 0064 encima de 0046. Prueba lo que el mapeo de overloads rompía:
 * el cliente llama a admin_set_listing_status con 3 args (0032), que seguía en
 * is_staff. 0064 lo pasa a has_perm('Gestión de avisos','edit'), de modo que
 * "deshabilitar/rehabilitar un aviso" por fin respeta el toggle "Moderar".
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0046 = read("0046_roles_permissions_enforced.sql");
const MIG_0064 = read("0064_listing_status_matrix.sql");

const U = {
  superadmin: "00000000-0000-0000-0000-0000000000a1",
  admin:      "00000000-0000-0000-0000-0000000000a2",
  moderador:  "00000000-0000-0000-0000-0000000000a3",
  soporte:    "00000000-0000-0000-0000-0000000000a4",
};
const AVISO = "00000000-0000-0000-0000-0000000000c1";
const DUENO = "00000000-0000-0000-0000-0000000000c2";

let db: PGlite;
const como = (uid: string) => db.exec(`set test.uid = '${uid}';`);
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const estado = () =>
  q<{ status: string }>(`select status::text as status from public.listings where id = '${AVISO}'`).then((r) => r[0].status);

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
    create table public.audit_logs (id serial primary key, action text);

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
      ('${U.superadmin}'), ('${U.admin}'), ('${U.moderador}'), ('${U.soporte}'), ('${DUENO}');
    insert into public.user_roles values
      ('${U.superadmin}', 'superadmin'), ('${U.admin}', 'admin'),
      ('${U.moderador}', 'moderador'), ('${U.soporte}', 'soporte');
    insert into public.listings (id, owner_id, title, status) values
      ('${AVISO}', '${DUENO}', 'Aviso de prueba', 'active');
  `);

  await db.exec(MIG_0046); // has_perm + siembra (admin/moderador editan avisos; soporte no)
  await db.exec(MIG_0064); // el overload de 3 args pasa a has_perm
});

beforeEach(() => db.exec(`update public.listings set status = 'active' where id = '${AVISO}';`));

describe("admin_set_listing_status (3 args) honra la matriz (0064)", () => {
  it("soporte NO puede deshabilitar un aviso: no tiene 'editar' en avisos", async () => {
    await como(U.soporte);
    await expect(
      q(`select public.admin_set_listing_status('${AVISO}', 'rejected', 'spam')`),
    ).rejects.toThrow(/no autorizado/);
    expect(await estado()).toBe("active"); // intacto
  });

  it("moderador SÍ puede: la matriz le da 'editar' en avisos", async () => {
    await como(U.moderador);
    await q(`select public.admin_set_listing_status('${AVISO}', 'rejected', 'incumple normas')`);
    expect(await estado()).toBe("rejected");
  });

  it("el superadmin puede siempre", async () => {
    await como(U.superadmin);
    await q(`select public.admin_set_listing_status('${AVISO}', 'rejected', 'x')`);
    expect(await estado()).toBe("rejected");
  });

  it("si el superadmin le da 'editar' a soporte, el RPC empieza a aceptarlo", async () => {
    await db.exec(
      `update public.role_permissions set can_edit = true where role = 'soporte' and module = 'Gestión de avisos'`,
    );
    await como(U.soporte);
    await q(`select public.admin_set_listing_status('${AVISO}', 'rejected', 'ok')`);
    expect(await estado()).toBe("rejected");
    await db.exec(
      `update public.role_permissions set can_edit = false where role = 'soporte' and module = 'Gestión de avisos'`,
    );
  });
});
