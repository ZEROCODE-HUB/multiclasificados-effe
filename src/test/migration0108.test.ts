// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0108 sobre 0046+0066: Gestión de usuarios puede devolver saldo, no solo
 * otorgarlo. Se comprueba el permiso, el motivo obligatorio, que un retiro
 * mayor que el saldo no mueva NADA, y que `admin_grant_credits` siga igual.
 */
const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0046 = read("0046_roles_permissions_enforced.sql");
const MIG_0066 = read("0066_grant_credits_matrix.sql");
const MIG_0108 = read("0108_el_saldo_tambien_se_quita.sql");

const U = {
  superadmin: "00000000-0000-0000-0000-0000000000a1",
  admin:      "00000000-0000-0000-0000-0000000000a2",
  soporte:    "00000000-0000-0000-0000-0000000000a4",
};
const CLIENTE = "00000000-0000-0000-0000-0000000000d9";

let db: PGlite;
const como = (uid: string) => db.exec(`set test.uid = '${uid}';`);
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const saldo = () =>
  q<{ b: string | null }>(`select balance::text as b from public.user_credits where user_id = '${CLIENTE}'`)
    .then((r) => (r.length ? r[0].b : null));

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
    create table public.audit_logs (
      id serial primary key, actor_id uuid, action text, entity_type text,
      entity_id uuid, metadata jsonb, created_at timestamptz default now()
    );
    -- balance >= 0 como en 0035: el saldo nunca puede quedar en rojo.
    create table public.user_credits (
      user_id uuid primary key, balance numeric(12,2) not null default 0 check (balance >= 0),
      updated_at timestamptz
    );
    create table public.credit_transactions (
      id serial primary key, user_id uuid,
      type text check (type in ('purchase','spend','refund')),
      credits numeric, description text, order_id uuid, created_at timestamptz default now()
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
    insert into public.profiles (id) values ('${U.superadmin}'), ('${U.admin}'), ('${U.soporte}'), ('${CLIENTE}');
    insert into public.user_roles values
      ('${U.superadmin}', 'superadmin'), ('${U.admin}', 'admin'), ('${U.soporte}', 'soporte');
  `);

  await db.exec(MIG_0046);
  await db.exec(MIG_0066);
  await db.exec(MIG_0108);
});

beforeEach(() =>
  db.exec(`delete from public.user_credits; delete from public.credit_transactions; delete from public.audit_logs;`));

const dar = (n: number, motivo = "abono acordado") =>
  q(`select public.admin_ajustar_saldo('${CLIENTE}', ${n}, '${motivo}')`);

describe("0108 — otorgar y quitar saldo desde Gestión de usuarios", () => {
  it("soporte no puede mover saldo: la matriz le niega 'editar' usuarios", async () => {
    await como(U.soporte);
    await expect(dar(50)).rejects.toThrow(/no tienes permiso/);
    expect(await saldo()).toBeNull();
  });

  it("otorga y devuelve el antes y el después", async () => {
    await como(U.admin);
    const [r] = await q<{ v: string }>(`select public.admin_ajustar_saldo('${CLIENTE}', 100, 'bono')::text as v`);
    const v = JSON.parse(r.v);
    expect(Number(v.saldo_anterior)).toBe(0);
    expect(Number(v.saldo)).toBe(100);
    expect(await saldo()).toBe("100.00");
  });

  it("quita saldo y lo anota como devolución, no como gasto del usuario", async () => {
    await como(U.admin);
    await dar(100);
    await dar(-30, "devolucion solicitada por el cliente");
    expect(await saldo()).toBe("70.00");

    const [t] = await q<{ type: string; credits: string; description: string }>(
      `select type, credits::text as credits, description from public.credit_transactions
        where credits < 0 order by id desc limit 1`);
    // 'refund' y no 'spend': get_credits_spent suma los 'spend' en valor
    // absoluto y contaría la devolución como consumo del usuario.
    expect(t.type).toBe("refund");
    expect(Number(t.credits)).toBe(-30);
    expect(t.description).toContain("devolucion solicitada");
  });

  it("un retiro mayor que el saldo se rechaza y NO mueve nada", async () => {
    await como(U.admin);
    await dar(20);
    await expect(dar(-50, "ajuste")).rejects.toThrow(/solo tiene/);
    expect(await saldo()).toBe("20.00");
    const [t] = await q<{ n: string }>(`select count(*)::text as n from public.credit_transactions`);
    expect(t.n).toBe("1"); // solo el abono inicial
  });

  it("el motivo es obligatorio: es dinero", async () => {
    await como(U.admin);
    await expect(q(`select public.admin_ajustar_saldo('${CLIENTE}', 10, '')`)).rejects.toThrow(/motivo/);
    await expect(q(`select public.admin_ajustar_saldo('${CLIENTE}', 10, '   ')`)).rejects.toThrow(/motivo/);
    await expect(q(`select public.admin_ajustar_saldo('${CLIENTE}', 10, null)`)).rejects.toThrow(/motivo/);
  });

  it("un delta de 0 no es un movimiento", async () => {
    await como(U.admin);
    await expect(dar(0)).rejects.toThrow(/otorgar o quitar/);
  });

  it("queda registrado en la auditoría, y distingue otorgar de quitar", async () => {
    await como(U.admin);
    await dar(50);
    await dar(-10, "ajuste");
    const filas = await q<{ action: string }>(`select action from public.audit_logs order by id`);
    expect(filas.map((f) => f.action)).toEqual(["grant_credits", "revoke_credits"]);
  });

  it("admin_grant_credits sigue funcionando igual que antes", async () => {
    await como(U.admin);
    const [r1] = await q<{ bal: string }>(`select public.admin_grant_credits('${CLIENTE}', 50, 'bono') as bal`);
    expect(Number(r1.bal)).toBe(50);
    const [r2] = await q<{ bal: string }>(`select public.admin_grant_credits('${CLIENTE}', 30, 'extra') as bal`);
    expect(Number(r2.bal)).toBe(80);
    await expect(q(`select public.admin_grant_credits('${CLIENTE}', 0, null)`)).rejects.toThrow(/mayor a 0/);
    // Sin motivo sigue aceptándose (la firma no cambió), pero deja rastro.
    await q(`select public.admin_grant_credits('${CLIENTE}', 5, null)`);
    const [t] = await q<{ d: string }>(`select description as d from public.credit_transactions order by id desc limit 1`);
    expect(t.d).toContain("sin motivo indicado");
  });

  it("el saldo se puede consultar desde el panel (la RLS no deja leerlo directo)", async () => {
    await como(U.admin);
    await dar(75);
    const [r] = await q<{ s: string }>(`select public.admin_saldo_usuario('${CLIENTE}')::text as s`);
    expect(Number(r.s)).toBe(75);
  });

  it("anon no puede ejecutarla", async () => {
    const [r] = await q<{ ok: boolean }>(
      `select has_function_privilege('anon', 'public.admin_ajustar_saldo(uuid, numeric, text)', 'execute') as ok`);
    expect(r.ok).toBe(false);
  });

  it("es re-ejecutable", async () => {
    await expect(db.exec(MIG_0108)).resolves.toBeDefined();
  });
});
