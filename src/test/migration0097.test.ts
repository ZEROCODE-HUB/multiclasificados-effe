// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0097 — el panel de control deja de enseñar porcentajes inventados.
 *
 * Dos cosas que probar, y las dos venían de un reporte de QA:
 *
 *  1. Que `admin_stats` devuelva el valor que cada cifra tenía hace 30 días,
 *     reconstruido de las fechas que ya guardan las tablas. Sin esto no hay
 *     variación posible y los "+3.2%" seguirían siendo literales.
 *
 *  2. Que `revenue` cuente SOLO lo cobrado por la pasarela. Sumaba toda orden
 *     'paid' —créditos regalados por un admin, backfill y pruebas SIMULADO—,
 *     así que la tarjeta decía S/ 5.373,74 y el gráfico de la misma pantalla
 *     S/ 145,77. Es el mismo filtro que la 0094 aplicó al gráfico.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG = read("0097_admin_stats_variacion.sql");

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const stats = async () => (await q<{ s: Record<string, number> }>("select public.admin_stats() as s"))[0].s;

// Momentos a un lado y a otro del corte de 30 días.
const VIEJO = "now() - interval '90 days'";
const RECIENTE = "now() - interval '3 days'";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select '00000000-0000-0000-0000-0000000000a1'::uuid $$;
    -- El panel es de staff; con is_staff false la RPC devuelve '{}'.
    create function public.is_staff(uuid) returns boolean language sql stable as $$ select true $$;

    create table public.profiles (id uuid primary key, created_at timestamptz not null default now());
    create table public.listings (
      id uuid primary key default gen_random_uuid(), status text not null,
      published_at timestamptz, expires_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.reports (
      id uuid primary key default gen_random_uuid(), status text not null,
      resolved_at timestamptz, created_at timestamptz not null default now()
    );
    create table public.orders (
      id uuid primary key default gen_random_uuid(), status text not null,
      payment_provider text, payment_ref text, total numeric,
      paid_at timestamptz, created_at timestamptz not null default now()
    );
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec(`
    delete from public.profiles; delete from public.listings;
    delete from public.reports;  delete from public.orders;
  `);
});

// ─────────────────────────────────────────────────────────────────────
describe("0097 · valores de hace 30 días", () => {
  it("usuarios: cuenta los que ya existían entonces", async () => {
    await db.exec(`
      insert into public.profiles (id, created_at) values
        (gen_random_uuid(), ${VIEJO}), (gen_random_uuid(), ${VIEJO}),
        (gen_random_uuid(), ${RECIENTE});
    `);
    const s = await stats();
    expect(s.users).toBe(3);
    expect(s.users_prev).toBe(2);
  });

  it("avisos: cuenta los que estaban vigentes entonces, no los que aún no existían", async () => {
    await db.exec(`
      insert into public.listings (status, published_at, expires_at) values
        -- vigente entonces y ahora
        ('active', ${VIEJO}, now() + interval '30 days'),
        -- publicado después del corte: no contaba hace 30 días
        ('active', ${RECIENTE}, now() + interval '30 days'),
        -- ya había vencido antes del corte: tampoco
        ('expired', now() - interval '120 days', now() - interval '60 days');
    `);
    const s = await stats();
    expect(s.active_listings).toBe(2);   // los dos 'active' de ahora
    expect(s.active_listings_prev).toBe(1);
  });

  it("reportes abiertos: los resueltos después del corte seguían abiertos entonces", async () => {
    await db.exec(`
      insert into public.reports (status, created_at, resolved_at) values
        ('open',     ${VIEJO},    null),                        -- abierto entonces y ahora
        ('resolved', ${VIEJO},    ${RECIENTE}),                 -- se cerró después: contaba
        ('resolved', ${VIEJO},    now() - interval '60 days'),  -- ya cerrado entonces: no
        ('open',     ${RECIENTE}, null);                        -- aún no existía
    `);
    const s = await stats();
    expect(s.reports_open).toBe(2);
    expect(s.reports_open_prev).toBe(2);
  });

  it("vendidos: se apoya en la última modificación (no hay sold_at)", async () => {
    await db.exec(`
      insert into public.listings (status, updated_at) values
        ('sold', ${VIEJO}), ('sold', ${RECIENTE}), ('active', ${VIEJO});
    `);
    const s = await stats();
    expect(s.sold_listings).toBe(2);
    expect(s.sold_listings_prev).toBe(1);
  });
});

describe("0097 · ingresos: solo lo cobrado de verdad", () => {
  beforeEach(async () => {
    await db.exec(`
      insert into public.orders (status, payment_provider, payment_ref, total, paid_at) values
        ('paid', 'izipay',   'tx-viejo',  100, ${VIEJO}),     -- cobro real, antes del corte
        ('paid', 'izipay',   'tx-nuevo',   45.77, ${RECIENTE}), -- cobro real, después
        ('paid', 'izipay',   'SIMULADO', 5000, ${VIEJO}),     -- prueba
        ('paid', 'creditos',  null,      3000, ${VIEJO}),     -- regalado por un admin
        ('paid', 'backfill',  null,      2000, ${VIEJO}),     -- migración
        ('paid', 'izipay',    null,       500, ${VIEJO}),     -- sin referencia de pago
        ('pending','izipay', 'tx-x',      999, null);         -- ni siquiera pagada
    `);
  });

  it("excluye simulaciones, regalos, backfill y órdenes sin referencia", async () => {
    const s = await stats();
    // 100 + 45.77 y nada más: ni los 5000 de la prueba ni los 3000 regalados.
    expect(Number(s.revenue)).toBe(145.77);
  });

  it("el acumulado de hace 30 días también filtra igual", async () => {
    const s = await stats();
    expect(Number(s.revenue_prev)).toBe(100);
  });
});

describe("0097 · contrato", () => {
  it("anuncia la ventana que usa, para que el cliente no la dé por supuesta", async () => {
    expect((await stats()).window_days).toBe(30);
  });

  it("conserva los campos que ya consumía el panel", async () => {
    const s = await stats();
    for (const campo of [
      "users", "active_listings", "pending_listings", "sold_listings",
      "total_listings", "reports_open", "revenue",
    ]) {
      expect(s, `falta ${campo}`).toHaveProperty(campo);
    }
  });

  it("no es invocable sin sesión", async () => {
    for (const rol of ["anon", "public"]) {
      const [r] = await q<{ p: boolean }>(
        `select has_function_privilege('${rol}', 'public.admin_stats()', 'execute') as p`,
      );
      expect(r, `rol ${rol}`).toEqual({ p: false });
    }
  });
});
