// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0127 — B-01: a quien ya contrató NO se le borra.
 *
 * Antes `admin_delete_user` borraba de `auth.users` y las FK en cascada
 * arrastraban todo: perfil, avisos, órdenes, boletas y facturas. De un cliente
 * que pagó no quedaba nada.
 *
 * El motivo es legal y lo dio el cliente: **SUNAT o el Poder Judicial pueden
 * pedir formalmente la relación de quienes contrataron**, activos e inactivos.
 * Eso no se reconstruye de lo borrado. Y los comprobantes hay que conservarlos
 * aunque el cliente se vaya: la boleta ya está declarada.
 *
 * Lo que se fija aquí es la decisión: cuándo se desactiva y cuándo se borra de
 * verdad. Guardar cuentas vacías no protege de nada y solo ensucia el maestro.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0127_no_borrar_a_quien_contrato.sql"),
  "utf8",
);

const JEFE  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // superadmin
const CON   = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // contrató
const SIN   = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // nunca contrató
const SOLO_ORDEN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const borrar = (u: string) => q<{ admin_delete_user: { accion: string } }>(
  `select public.admin_delete_user('${u}') as admin_delete_user`);
const perfil = async (u: string) =>
  (await q<{ status: string }>(`select status from public.profiles where id = '${u}'`))[0];
const existe = async (u: string) =>
  (await q<{ n: number }>(`select count(*)::int as n from auth.users where id = '${u}'`))[0].n > 0;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role service_role;
    create schema auth;

    create table auth.users (id uuid primary key);
    -- Las columnas de mas existen porque la migracion recrea admin_list_users,
    -- que las consulta. Sin ellas el fallo habla de una columna que falta y no
    -- apunta a nada de lo que aqui se prueba.
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      status text default 'active',
      full_name text, email text, verified boolean default false,
      suspended_until timestamptz, rating numeric default 0,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create table public.listings (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references auth.users(id) on delete cascade,
      status text default 'active'
    );
    create table public.orders (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade
    );
    create table public.invoices (
      id uuid primary key default gen_random_uuid(),
      order_id uuid references public.orders(id) on delete cascade
    );
    create table public.pricing_settings (id int primary key, updated_by uuid);

    -- Quien ejecuta es el superadmin.
    create function auth.uid() returns uuid language sql stable as $$ select '${JEFE}'::uuid $$;
    create function public.has_role(_u uuid, _r text) returns boolean
      language sql stable as $$ select _u = '${JEFE}'::uuid and _r = 'superadmin' $$;
    create function public.has_perm(_m text, _a text) returns boolean
      language sql stable as $$ select true $$;
    create table public.auditoria (accion text, objeto text);
    create function public.log_audit(a text, t text, o text, d jsonb) returns void
      language sql as $$ insert into public.auditoria values (a, o) $$;
    create function public.is_staff(_u uuid) returns boolean
      language sql stable as $$ select true $$;
    create table public.user_roles (user_id uuid, role text);
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec(`
    delete from public.invoices; delete from public.orders;
    delete from public.listings; delete from public.profiles; delete from auth.users;
    delete from public.auditoria;
    insert into auth.users values ('${JEFE}'), ('${CON}'), ('${SIN}'), ('${SOLO_ORDEN}');
    insert into public.profiles (id) values ('${JEFE}'), ('${CON}'), ('${SIN}'), ('${SOLO_ORDEN}');
    insert into public.listings (owner_id) values ('${CON}');
    insert into public.orders (user_id) values ('${SOLO_ORDEN}');
  `);
});

describe("quien ya contrató NO se borra", () => {
  it("queda inactivo, y su cuenta sigue existiendo", async () => {
    const r = await borrar(CON);
    expect(r[0].admin_delete_user.accion).toBe("desactivado");
    expect(await existe(CON)).toBe(true);
    expect((await perfil(CON)).status).toBe("inactive");
  });

  it("y conserva sus avisos: son el rastro de lo que contrató", async () => {
    await borrar(CON);
    const n = (await q<{ n: number }>(
      `select count(*)::int as n from public.listings where owner_id = '${CON}'`))[0].n;
    expect(n).toBe(1);
  });

  it("pero sus avisos activos se pausan: nadie va a atenderlos", async () => {
    await borrar(CON);
    const s = (await q<{ status: string }>(
      `select status from public.listings where owner_id = '${CON}'`))[0].status;
    expect(s).toBe("paused");
  });

  it("cuenta también quien compró saldo SIN publicar nada", async () => {
    // Tiene una boleta emitida a su nombre y declarada ante SUNAT. Borrarlo
    // dejaría un comprobante sin cliente, que es justo el agujero a tapar.
    const r = await borrar(SOLO_ORDEN);
    expect(r[0].admin_delete_user.accion).toBe("desactivado");
    expect(await existe(SOLO_ORDEN)).toBe(true);
  });
});

describe("quien nunca contrató sí se borra", () => {
  it("se elimina de verdad: guardar cuentas vacías no protege de nada", async () => {
    const r = await borrar(SIN);
    expect(r[0].admin_delete_user.accion).toBe("eliminado");
    expect(await existe(SIN)).toBe(false);
  });
});

describe("las salvaguardas de siempre siguen", () => {
  it("no puedes darte de baja a ti mismo desde el panel", async () => {
    await expect(borrar(JEFE)).rejects.toThrow(/tu propia cuenta/i);
  });

  it("las dos vías quedan en auditoría, con acciones distintas", async () => {
    // Distinguirlas importa: "eliminado" y "desactivado" no son lo mismo si
    // algún día hay que explicar qué se hizo con un cliente.
    await borrar(CON);
    await borrar(SIN);
    const a = await q<{ accion: string }>(`select accion from public.auditoria order by accion`);
    expect(a.map((x) => x.accion)).toEqual(["deactivate_user", "delete_user"]);
  });
});

describe("se puede deshacer", () => {
  it("reactivar devuelve al cliente a activo", async () => {
    // Sin esto la primera baja por error obligaría a entrar a la base de datos.
    await borrar(CON);
    await q(`select public.admin_reactivar_usuario('${CON}')`);
    expect((await perfil(CON)).status).toBe("active");
  });

  it("pero NO revive sus avisos: eso lo decide el dueño", async () => {
    await borrar(CON);
    await q(`select public.admin_reactivar_usuario('${CON}')`);
    const s = (await q<{ status: string }>(
      `select status from public.listings where owner_id = '${CON}'`))[0].status;
    expect(s).toBe("paused");
  });
});
