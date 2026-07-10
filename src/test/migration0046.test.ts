// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0046 (el fichero REAL) contra un Postgres de verdad.
 *
 * Lo que se prueba no es SQL bonito: es que un Soporte con "Editar" desmarcado
 * reciba un ERROR DEL SERVIDOR al intentar suspender a alguien. Antes solo se
 * le escondía el botón, y llamar al RPC a mano funcionaba igual.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0046_roles_permissions_enforced.sql"),
  "utf8",
);

const U = {
  superadmin: "00000000-0000-0000-0000-0000000000a1",
  admin:      "00000000-0000-0000-0000-0000000000a2",
  moderador:  "00000000-0000-0000-0000-0000000000a3",
  soporte:    "00000000-0000-0000-0000-0000000000a4",
  buscador:   "00000000-0000-0000-0000-0000000000a5",
};
const VICTIMA = "00000000-0000-0000-0000-0000000000b9";

let db: PGlite;

/** auth.uid() lee un setting de sesión: así "iniciamos sesión" en el test. */
const como = (uid: string) => db.exec(`set test.uid = '${uid}';`);

const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const puede = (modulo: string, accion: string) =>
  q<{ ok: boolean }>(`select public.has_perm('${modulo}', '${accion}') as ok`).then((r) => r[0].ok);

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
    -- La 0046 reescribe admin_get_listing y admin_resolve_report: sus cuerpos se
    -- validan al crearse, así que el esquema tiene que tener lo que tocan.
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
      ('${U.superadmin}'), ('${U.admin}'), ('${U.moderador}'), ('${U.soporte}'), ('${U.buscador}'), ('${VICTIMA}');
    insert into public.user_roles values
      ('${U.superadmin}', 'superadmin'), ('${U.admin}', 'admin'),
      ('${U.moderador}', 'moderador'), ('${U.soporte}', 'soporte'), ('${U.buscador}', 'buscador');
  `);

  // El fichero real, tal cual está en disco.
  await db.exec(MIGRATION);
});

beforeEach(() => db.exec("update public.profiles set status = 'active', verified = false;"));

describe("is_staff", () => {
  it("moderador y soporte pasan a ser personal de la plataforma", async () => {
    const r = await q<{ mod: boolean; sop: boolean }>(
      `select public.is_staff('${U.moderador}') as mod, public.is_staff('${U.soporte}') as sop`,
    );
    expect(r[0]).toEqual({ mod: true, sop: true });
  });

  it("un buscador sigue sin serlo", async () => {
    const r = await q<{ ok: boolean }>(`select public.is_staff('${U.buscador}') as ok`);
    expect(r[0].ok).toBe(false);
  });
});

describe("has_perm", () => {
  it("el superadmin puede todo: define la matriz, no está sujeto a ella", async () => {
    await como(U.superadmin);
    expect(await puede("Gestión de usuarios", "delete")).toBe(true);
    expect(await puede("Auditoría y logs", "edit")).toBe(true);
  });

  it("soporte solo mira: no edita ni aprueba", async () => {
    await como(U.soporte);
    expect(await puede("Gestión de usuarios", "view")).toBe(true);
    expect(await puede("Gestión de usuarios", "edit")).toBe(false);
    expect(await puede("Gestión de avisos", "approve")).toBe(false);
  });

  it("moderador edita lo suyo, pero no la configuración comercial", async () => {
    await como(U.moderador);
    expect(await puede("Conversaciones reportadas", "edit")).toBe(true);
    expect(await puede("Gestión de avisos", "edit")).toBe(true);
    expect(await puede("Configuración comercial", "edit")).toBe(false);
  });

  it("nadie borra por defecto", async () => {
    for (const u of [U.admin, U.moderador, U.soporte]) {
      await como(u);
      expect(await puede("Gestión de usuarios", "delete")).toBe(false);
    }
  });

  it("sin sesión no hay permiso", async () => {
    await db.exec("set test.uid = '';");
    expect(await puede("Gestión de avisos", "view")).toBe(false);
  });

  it("una acción inventada es un error, no un 'sí' silencioso", async () => {
    await como(U.admin);
    await expect(q(`select public.has_perm('Gestión de avisos', 'volar')`)).rejects.toThrow(/acción inválida/);
  });
});

describe("los RPCs obedecen la matriz, no solo la interfaz", () => {
  it("soporte NO puede suspender a un usuario aunque llame al RPC directamente", async () => {
    await como(U.soporte);
    await expect(
      q(`select public.admin_set_user_status('${VICTIMA}', 'suspended', 'motivo', null)`),
    ).rejects.toThrow(/no autorizado/);

    const [p] = await q<{ status: string }>(`select status from public.profiles where id = '${VICTIMA}'`);
    expect(p.status).toBe("active"); // intacto
  });

  it("moderador sí puede suspender: la matriz le da 'editar' en usuarios", async () => {
    await como(U.moderador);
    await q(`select public.admin_set_user_status('${VICTIMA}', 'suspended', 'spam', null)`);

    const [p] = await q<{ status: string }>(`select status from public.profiles where id = '${VICTIMA}'`);
    expect(p.status).toBe("suspended");
  });

  it("moderador NO puede verificar: eso es 'aprobar' en usuarios, y no lo tiene", async () => {
    await como(U.moderador);
    await expect(q(`select public.admin_verify_user('${VICTIMA}', true)`)).rejects.toThrow(/no autorizado/);
  });

  it("soporte NO puede deshabilitar un aviso", async () => {
    await db.exec(`insert into public.listings (id, status) values ('${VICTIMA}', 'active') on conflict do nothing`);
    await como(U.soporte);
    await expect(
      q(`select public.admin_set_listing_status('${VICTIMA}', 'rejected')`),
    ).rejects.toThrow(/no autorizado/);
  });

  it("si el superadmin le concede 'editar' a soporte, el RPC empieza a aceptarlo", async () => {
    await db.exec(
      `update public.role_permissions set can_edit = true where role = 'soporte' and module = 'Gestión de usuarios'`,
    );
    await como(U.soporte);
    await q(`select public.admin_set_user_status('${VICTIMA}', 'suspended', 'ok', null)`);

    const [p] = await q<{ status: string }>(`select status from public.profiles where id = '${VICTIMA}'`);
    expect(p.status).toBe("suspended");

    await db.exec(
      `update public.role_permissions set can_edit = false where role = 'soporte' and module = 'Gestión de usuarios'`,
    );
  });

  it("un buscador no toca nada: no tiene filas en la matriz", async () => {
    await como(U.buscador);
    await expect(
      q(`select public.admin_set_user_status('${VICTIMA}', 'banned', null, null)`),
    ).rejects.toThrow(/no autorizado/);
  });
});

describe("siembra de la matriz", () => {
  it("crea los 8 módulos para admin, moderador y soporte", async () => {
    const r = await q<{ role: string; n: string }>(
      `select role, count(*)::text as n from public.role_permissions group by role order by role`,
    );
    expect(r).toEqual([
      { role: "admin", n: "8" },
      { role: "moderador", n: "8" },
      { role: "soporte", n: "8" },
    ]);
  });

  it("no pisa lo que el superadmin ya había configurado", async () => {
    // 'soporte / Gestión de avisos' con can_delete: si la migración lo sobreescribiera,
    // cada despliegue desharía los cambios del superadmin.
    await db.exec(
      `update public.role_permissions set can_delete = true where role = 'soporte' and module = 'Gestión de avisos'`,
    );
    await db.exec(MIGRATION);

    const [r] = await q<{ can_delete: boolean }>(
      `select can_delete from public.role_permissions where role = 'soporte' and module = 'Gestión de avisos'`,
    );
    expect(r.can_delete).toBe(true);
  });
});
