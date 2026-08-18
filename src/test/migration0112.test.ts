// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0112 — reporte de saldos a favor.
 *
 * Es la deuda viva de la plataforma: dinero ya cobrado que todavía no se ha
 * convertido en avisos. Antes había que sumarlo a mano desde el historial de
 * movimientos, que cuenta otra cosa.
 */
const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0046 = read("0046_roles_permissions_enforced.sql");
const MIG_0112 = read("0112_reporte_de_saldos.sql");

const U = {
  admin:   "00000000-0000-0000-0000-0000000000a2",
  soporte: "00000000-0000-0000-0000-0000000000a4",
};
const ANA = "00000000-0000-0000-0000-0000000000d1";
const LUIS = "00000000-0000-0000-0000-0000000000d2";
const SIN_SALDO = "00000000-0000-0000-0000-0000000000d3";

let db: PGlite;
const como = (uid: string) => db.exec(`set test.uid = '${uid}';`);
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const saldos = (args = "") =>
  q<{ full_name: string; balance: string; doc_number: string; total_count: string }>(
    `select full_name, balance::text as balance, doc_number, total_count::text as total_count
       from public.admin_saldos_usuarios(${args})`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid $$;

    create type public.app_role as enum ('anunciante','buscador','admin','superadmin','moderador','soporte');
    create type public.listing_status as enum ('draft','pending','active','paused','rejected','expired','sold');
    create type public.doc_type as enum ('dni','ruc','ce','pasaporte');

    create table public.profiles (
      id uuid primary key, full_name text, email text, status text default 'active',
      verified boolean default false, ban_reason text, suspended_until timestamptz,
      doc_type public.doc_type, doc_number text
    );
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
    create table public.audit_logs (
      id serial primary key, actor_id uuid, action text, entity_type text,
      entity_id uuid, metadata jsonb, created_at timestamptz default now()
    );
    create table public.user_credits (user_id uuid primary key, balance numeric(12,2) default 0, updated_at timestamptz);

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
    insert into public.profiles (id, full_name, email, doc_type, doc_number) values
      ('${U.admin}',   'Admin',        'admin@effe.pe',  null, null),
      ('${U.soporte}', 'Soporte',      'sop@effe.pe',    null, null),
      ('${ANA}',       'Ana García',   'ana@correo.com', 'dni', '44443333'),
      ('${LUIS}',      'Luis Torres',  'luis@correo.com','dni', '10101010'),
      ('${SIN_SALDO}', 'Sin Saldo',    'cero@correo.com','dni', '99999999');
    insert into public.user_roles values ('${U.admin}', 'admin'), ('${U.soporte}', 'soporte');
    insert into public.user_credits (user_id, balance) values
      ('${ANA}', 250.50), ('${LUIS}', 40), ('${SIN_SALDO}', 0);
  `);

  await db.exec(MIG_0046);
  await db.exec(MIG_0112);
});

describe("0112 — saldos a favor", () => {
  it("lista a quien tiene dinero pendiente, de mayor a menor", async () => {
    await como(U.admin);
    const filas = await saldos();
    expect(filas.map((f) => f.full_name)).toEqual(["Ana García", "Luis Torres"]);
    expect(Number(filas[0].balance)).toBe(250.5);
  });

  it("no incluye a quien tiene cero (no se le debe nada)", async () => {
    await como(U.admin);
    const filas = await saldos();
    expect(filas.some((f) => f.full_name === "Sin Saldo")).toBe(false);
  });

  it("con el interruptor, salen todos", async () => {
    await como(U.admin);
    const filas = await saldos("p_solo_con_saldo => false");
    expect(filas.some((f) => f.full_name === "Sin Saldo")).toBe(true);
  });

  it("trae el documento, que es lo que se pidió en el reporte", async () => {
    await como(U.admin);
    const [ana] = await saldos("p_search => 'Ana'");
    expect(ana.doc_number).toBe("44443333");
  });

  it("busca por nombre, correo y documento", async () => {
    await como(U.admin);
    expect((await saldos("p_search => 'Torres'")).length).toBe(1);
    expect((await saldos("p_search => 'ana@correo'")).length).toBe(1);
    expect((await saldos("p_search => '10101010'")).length).toBe(1);
    expect((await saldos("p_search => 'nadie'")).length).toBe(0);
  });

  it("el total viaja en cada fila, para poder paginar en el servidor", async () => {
    await como(U.admin);
    const filas = await saldos("p_limit => 1");
    expect(filas.length).toBe(1);
    expect(filas[0].total_count).toBe("2"); // hay 2 con saldo, aunque devuelva 1
  });

  it("soporte no ve el dinero de nadie: es un dato financiero", async () => {
    await como(U.soporte);
    expect(await saldos()).toEqual([]);
  });

  it("anon no puede ni ejecutarla", async () => {
    const [r] = await q<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.admin_saldos_usuarios(text, boolean, int, int)', 'execute') as ok`);
    expect(r.ok).toBe(false);
  });

  it("es re-ejecutable", async () => {
    await expect(db.exec(MIG_0112)).resolves.toBeDefined();
  });
});
