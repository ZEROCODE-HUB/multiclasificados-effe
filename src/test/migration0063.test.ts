// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre 0063 (el fichero REAL) encima de 0046, contra un Postgres de verdad.
 *
 * Lo que se prueba: antes "Eliminar usuario" era superadmin-only e ignoraba la
 * casilla `delete` de la matriz (el toggle de "Roles y permisos" no hacía nada).
 * Ahora `admin_delete_user` exige `has_perm('Gestión de usuarios','delete')`, que
 * ya es true para el superadmin. Así que: superadmin borra siempre, un admin solo
 * si el superadmin le enciende el toggle, y nadie puede borrarse a sí mismo.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0046 = read("0046_roles_permissions_enforced.sql");
const MIG_0063 = read("0063_delete_user_by_matrix.sql");

const U = {
  superadmin: "00000000-0000-0000-0000-0000000000a1",
  admin:      "00000000-0000-0000-0000-0000000000a2",
  soporte:    "00000000-0000-0000-0000-0000000000a4",
};
const VICTIMA = "00000000-0000-0000-0000-0000000000b9";

let db: PGlite;
const como = (uid: string) => db.exec(`set test.uid = '${uid}';`);
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const existeAuth = (uid: string) =>
  q<{ n: string }>(`select count(*)::text as n from auth.users where id = '${uid}'`).then(
    (r) => r[0].n === "1",
  );

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

    -- Lo que 0063 toca además de has_perm: auth.users (borra de aquí) y
    -- pricing_settings.updated_by (la única FK NO ACTION que libera antes de borrar).
    create table auth.users (id uuid primary key);
    create table public.pricing_settings (id int primary key, updated_by uuid);
  `);

  await db.exec(`
    insert into public.profiles (id) values
      ('${U.superadmin}'), ('${U.admin}'), ('${U.soporte}'), ('${VICTIMA}');
    insert into public.user_roles values
      ('${U.superadmin}', 'superadmin'), ('${U.admin}', 'admin'), ('${U.soporte}', 'soporte');
    insert into auth.users (id) values
      ('${U.superadmin}'), ('${U.admin}'), ('${U.soporte}'), ('${VICTIMA}');
    insert into public.pricing_settings (id, updated_by) values (1, '${VICTIMA}');
  `);

  await db.exec(MIG_0046); // aporta has_perm + siembra la matriz (admin/moderador/soporte)
  await db.exec(MIG_0063); // redefine admin_delete_user
});

// Cada test parte de la matriz sembrada por 0046 (delete = false en todos) y con
// la víctima presente en auth.users.
beforeEach(async () => {
  await db.exec(`
    update public.role_permissions set can_delete = false where module = 'Gestión de usuarios';
    insert into auth.users (id) values ('${VICTIMA}') on conflict do nothing;
    update public.pricing_settings set updated_by = '${VICTIMA}' where id = 1;
  `);
});

describe("admin_delete_user honra la matriz (0063)", () => {
  it("un admin SIN el toggle 'delete' no puede eliminar", async () => {
    await como(U.admin);
    await expect(q(`select public.admin_delete_user('${VICTIMA}')`)).rejects.toThrow(/no tienes permiso/);
    expect(await existeAuth(VICTIMA)).toBe(true); // intacto
  });

  it("soporte tampoco: no tiene 'delete' en usuarios", async () => {
    await como(U.soporte);
    await expect(q(`select public.admin_delete_user('${VICTIMA}')`)).rejects.toThrow(/no tienes permiso/);
    expect(await existeAuth(VICTIMA)).toBe(true);
  });

  it("el superadmin borra siempre, sin necesitar fila en la matriz", async () => {
    await como(U.superadmin);
    await q(`select public.admin_delete_user('${VICTIMA}')`);
    expect(await existeAuth(VICTIMA)).toBe(false);
    // Y liberó la referencia NO ACTION antes de borrar.
    const [ps] = await q<{ updated_by: string | null }>(`select updated_by from public.pricing_settings where id = 1`);
    expect(ps.updated_by).toBeNull();
  });

  it("si el superadmin enciende 'delete' para admin, el RPC empieza a aceptarlo", async () => {
    await db.exec(
      `update public.role_permissions set can_delete = true where role = 'admin' and module = 'Gestión de usuarios'`,
    );
    await como(U.admin);
    await q(`select public.admin_delete_user('${VICTIMA}')`);
    expect(await existeAuth(VICTIMA)).toBe(false);
  });

  it("nadie puede eliminar su propia cuenta, ni con permiso", async () => {
    await db.exec(
      `update public.role_permissions set can_delete = true where role = 'admin' and module = 'Gestión de usuarios'`,
    );
    await como(U.admin);
    await expect(q(`select public.admin_delete_user('${U.admin}')`)).rejects.toThrow(/tu propia cuenta/);
    expect(await existeAuth(U.admin)).toBe(true);
  });
});
