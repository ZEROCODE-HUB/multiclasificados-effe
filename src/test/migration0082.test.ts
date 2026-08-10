// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0082 (fichero REAL) contra un Postgres de verdad.
 *
 * Numeración fiscal. Lo que hay que garantizar:
 *   - boleta y factura llevan series distintas (B001 / F001) y contadores
 *     INDEPENDIENTES: con la serie equivocada SUNAT rechaza el comprobante;
 *   - la numeración no deja huecos, ni siquiera cuando una transacción aborta
 *     (por eso NO puede usarse una secuencia: nextval no revierte);
 *   - dos comprobantes no pueden compartir número ni compra;
 *   - los comprobantes anteriores quedan marcados como internos y el contador
 *     arranca donde ellos terminaron, sin colisionar.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0082_invoice_series.sql"),
  "utf8",
);

let db: PGlite;

/** Identificador de orden distinto para cada número, con formato válido. */
const ORDER = (n: number) => `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`;

/** Esquema mínimo anterior a 0082: invoices con el trigger viejo (serie fija). */
async function esquemaBase(conHistoricos = 0) {
  db = new PGlite();
  await db.exec(`
    create type public.invoice_type as enum ('boleta','factura');
    create type public.doc_type     as enum ('dni','ruc','ce');

    create table public.profiles (id uuid primary key, full_name text);
    create table public.orders (
      id uuid primary key,
      user_id uuid,
      total numeric(12,2) not null default 0
    );

    create sequence if not exists public.invoice_number_seq;
    create table public.invoices (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null references public.orders (id) on delete cascade,
      number text not null unique,
      type public.invoice_type not null default 'boleta',
      email text, advertiser_name text, doc_number text,
      doc_type public.doc_type, factiliza_data jsonb,
      amount numeric(12,2) not null default 0,
      detail text,
      issued_at timestamptz not null default now()
    );
    alter table public.invoices enable row level security;

    -- El trigger VIEJO: serie fija 'B001-' salga lo que salga.
    create or replace function public.set_invoice_number()
    returns trigger language plpgsql as $$
    begin
      if new.number is null or new.number = '' then
        new.number := 'B001-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
      end if;
      return new;
    end; $$;
    create trigger invoices_set_number
      before insert on public.invoices
      for each row execute function public.set_invoice_number();

    create table public.system_settings (
      key text primary key, value jsonb not null default '{}'::jsonb,
      label text, updated_at timestamptz not null default now()
    );
    create or replace function public.has_perm(p_module text, p_action text)
    returns boolean language sql stable as $$ select true $$;
  `);

  for (let i = 1; i <= conHistoricos; i++) {
    await db.exec(`insert into public.orders (id, total) values ('${ORDER(i)}', 100);`);
    await db.exec(`insert into public.invoices (order_id, amount) values ('${ORDER(i)}', 100);`);
  }
}

/** Crea una orden y su comprobante, y devuelve el número asignado. */
async function emitir(n: number, tipo: "boleta" | "factura" = "boleta") {
  await db.exec(`insert into public.orders (id, total) values ('${ORDER(n)}', 100);`);
  const { rows } = await db.query<{ number: string; serie: string; correlativo: number }>(
    `insert into public.invoices (order_id, amount, type)
     values ('${ORDER(n)}', 100, '${tipo}') returning number, serie, correlativo`,
  );
  return rows[0];
}

const serieCorrelativo = async (id: string) => {
  const { rows } = await db.query<{ correlativo: string }>(
    `select correlativo from public.invoice_series where id = '${id}'`,
  );
  return Number(rows[0].correlativo);
};

beforeEach(async () => {
  await esquemaBase();
  await db.exec(MIGRATION);
});

describe("0082 — series por tipo de comprobante", () => {
  it("la boleta va con B001 y la factura con F001", async () => {
    expect((await emitir(1, "boleta")).number).toBe("B001-000001");
    expect((await emitir(2, "factura")).number).toBe("F001-000001");
  });

  it("cada serie lleva su propio contador, aunque se intercalen", async () => {
    const nums: string[] = [];
    for (let i = 1; i <= 6; i++) {
      nums.push((await emitir(i, i % 2 === 1 ? "boleta" : "factura")).number);
    }
    expect(nums.filter((n) => n.startsWith("B001"))).toEqual([
      "B001-000001", "B001-000002", "B001-000003",
    ]);
    expect(nums.filter((n) => n.startsWith("F001"))).toEqual([
      "F001-000001", "F001-000002", "F001-000003",
    ]);
  });

  it("guarda serie y correlativo en columnas propias, no solo en el texto", async () => {
    const f = await emitir(1, "factura");
    expect(f.serie).toBe("F001");
    expect(Number(f.correlativo)).toBe(1);
  });

  it("cien comprobantes seguidos, sin huecos ni repetidos", async () => {
    for (let i = 1; i <= 100; i++) await emitir(i);
    const { rows } = await db.query<{ correlativo: string }>(
      `select correlativo from public.invoices where serie = 'B001' order by correlativo`,
    );
    expect(rows.map((r) => Number(r.correlativo))).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
  });
});

describe("0082 — una transacción abortada no quema el número", () => {
  // Esta es LA prueba que separa `update ... returning` de una secuencia:
  // nextval() no revierte, así que con el diseño viejo este correlativo se
  // perdería y la numeración fiscal quedaría con un hueco que justificar.
  it("tras un rollback, el siguiente comprobante toma el mismo correlativo", async () => {
    await db.exec("begin");
    await db.exec(`insert into public.orders (id, total) values ('${ORDER(1)}', 100);`);
    await db.exec(`insert into public.invoices (order_id, amount) values ('${ORDER(1)}', 100);`);
    await db.exec("rollback");

    expect(await serieCorrelativo("boleta")).toBe(0);
    expect((await emitir(2)).number).toBe("B001-000001");
  });
});

describe("0082 — invariantes que el código no puede saltarse", () => {
  it("no admite dos comprobantes con el mismo número", async () => {
    await emitir(1);
    await db.exec(`insert into public.orders (id, total) values ('${ORDER(2)}', 100);`);
    await expect(
      db.exec(`insert into public.invoices (order_id, amount, number, serie, correlativo)
               values ('${ORDER(2)}', 100, 'B001-000001', 'B001', 1)`),
    ).rejects.toThrow();
  });

  it("no admite dos comprobantes para la misma compra", async () => {
    await emitir(1);
    await expect(
      db.exec(`insert into public.invoices (order_id, amount) values ('${ORDER(1)}', 100)`),
    ).rejects.toThrow();
  });
});

describe("0082 — los comprobantes anteriores", () => {
  beforeEach(async () => {
    await esquemaBase(5); // cinco boletas del sistema viejo: B001-000001..5
    await db.exec(MIGRATION);
  });

  it("quedan marcados como internos, no como pendientes de enviar", async () => {
    const { rows } = await db.query<{ sunat_status: string; email_status: string; n: string }>(
      `select sunat_status, email_status, count(*)::text as n
         from public.invoices group by 1,2`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sunat_status).toBe("omitido");
    expect(rows[0].email_status).toBe("omitido");
    expect(Number(rows[0].n)).toBe(5);
  });

  it("se les rellena serie y correlativo leyéndolos de su número", async () => {
    const { rows } = await db.query<{ number: string; serie: string; correlativo: string }>(
      `select number, serie, correlativo from public.invoices order by correlativo`,
    );
    expect(rows[0].number).toBe("B001-000001");
    expect(rows[0].serie).toBe("B001");
    expect(Number(rows[0].correlativo)).toBe(1);
    expect(rows[4].serie).toBe("B001");
    expect(Number(rows[4].correlativo)).toBe(5);
  });

  it("el contador arranca donde terminaron, sin chocar con ellos", async () => {
    expect(await serieCorrelativo("boleta")).toBe(5);
    expect((await emitir(6)).number).toBe("B001-000006");
    // La factura no hereda nada: empieza de cero.
    expect((await emitir(7, "factura")).number).toBe("F001-000001");
  });
});

describe("0082 — seguridad y repetibilidad", () => {
  it("quita la regla que dejaba crear comprobantes desde el navegador", async () => {
    // La policy de la 0019 permitía al dueño de una orden insertar en invoices.
    // Con emisión fiscal real, eso sería fabricar documentos ante SUNAT.
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from pg_policies
        where tablename = 'invoices' and cmd = 'INSERT'`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });

  it("la emisión ante SUNAT nace apagada", async () => {
    const { rows } = await db.query<{ on: boolean }>(
      `select public.invoice_emission_enabled() as on`,
    );
    expect(rows[0].on).toBe(false);
  });

  it("se puede volver a aplicar sin romper nada", async () => {
    await emitir(1);
    await db.exec(MIGRATION);
    expect(await serieCorrelativo("boleta")).toBe(1);
    expect((await emitir(2)).number).toBe("B001-000002");
  });
});
