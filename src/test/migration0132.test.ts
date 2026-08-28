// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * LAS RENOVACIONES SE CUENTAN (migración 0132).
 *
 * Lo reportó el cliente y tenía razón:
 *
 *   "cada vez que se RENUEVA un aviso, se refleja correctamente en los importes
 *    que se muestran, pero NO contabiliza la cantidad de avisos."
 *
 * Los reportes por categoría y por región hacían `count(distinct l.id)` para los
 * avisos y `sum(revenue)` para el monto. El monto incluye publicar, renovar y
 * los adicionales; el conteo cuenta AVISOS, y un aviso renovado cinco veces
 * sigue siendo un aviso. Las dos columnas contaban cosas distintas y se leían
 * como si fueran la misma.
 *
 * Y había un segundo fallo que el cliente no menciona: el filtro de fechas iba
 * sobre `l.created_at`, la fecha en que se CREÓ el aviso. Una renovación de
 * agosto sobre un aviso de enero entraba en el importe pero se filtraba por
 * enero, así que pedir "los ingresos de este mes" no las enseñaba.
 */

const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0132_las_renovaciones_se_cuentan.sql"),
  "utf8",
);

const STAFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AVISO_VIEJO = "11111111-1111-4111-8111-111111111111";
const AVISO_NUEVO = "22222222-2222-4222-8222-222222222222";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

interface FilaCat { cat: string; avisos: number; renovaciones: number; monto: string }

const porCategoria = (desde?: string, hasta?: string) =>
  q<FilaCat>(`select * from public.admin_category_revenue(${desde ? `'${desde}'` : "null"}, ${hasta ? `'${hasta}'` : "null"})`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '${STAFF}'::uuid $$;
    create function public.is_staff(u uuid) returns boolean language sql stable as $$ select true $$;

    create table public.categories (id text primary key, name text);
    insert into public.categories values ('inmuebles', 'Inmuebles');

    create table public.listings (
      id uuid primary key, category_id text, location text, created_at timestamptz
    );

    create table public.credit_transactions (
      id serial primary key, type text, credits numeric,
      description text, listing_id uuid, created_at timestamptz
    );
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec(`
    delete from public.credit_transactions;
    delete from public.listings;
    -- Un aviso creado en ENERO y otro en AGOSTO, ambos de Lima.
    insert into public.listings values
      ('${AVISO_VIEJO}', 'inmuebles', 'Lima, Lima', '2026-01-10'),
      ('${AVISO_NUEVO}', 'inmuebles', 'Lima, Lima', '2026-08-05');
    -- El viejo se publicó en enero y se RENOVÓ dos veces en agosto.
    insert into public.credit_transactions (type, credits, description, listing_id, created_at) values
      ('spend', -100, 'Publicación de aviso', '${AVISO_VIEJO}', '2026-01-10'),
      ('spend',  -50, 'Renovación de aviso',  '${AVISO_VIEJO}', '2026-08-12'),
      ('spend',  -50, 'Renovación de aviso',  '${AVISO_VIEJO}', '2026-08-20'),
      ('spend', -200, 'Publicación de aviso', '${AVISO_NUEVO}', '2026-08-05');
  `);
});

describe("las renovaciones se cuentan aparte de los avisos", () => {
  it("sin filtro: dos avisos y las dos renovaciones", async () => {
    const [f] = await porCategoria();
    expect(f.avisos).toBe(2);
    expect(f.renovaciones).toBe(2);
    expect(Number(f.monto)).toBe(400);
  });

  it("un aviso renovado sigue siendo UN aviso, no tres", async () => {
    // Es la mitad del malentendido: el conteo nunca debió subir. Lo que faltaba
    // era decir cuántas renovaciones hubo, no inflar el número de avisos.
    const [f] = await porCategoria();
    expect(f.avisos).toBe(2);
  });
});

describe("cada columna se filtra por SU fecha", () => {
  it("en agosto: un aviso creado, pero las dos renovaciones y su dinero", async () => {
    // Antes, al filtrar por agosto, el importe de las renovaciones desaparecía:
    // se filtraba por la fecha de CREACIÓN del aviso, que era enero.
    const [f] = await porCategoria("2026-08-01", "2026-08-31");
    expect(f.avisos).toBe(1);          // solo el creado en agosto
    expect(f.renovaciones).toBe(2);    // las dos, aunque el aviso sea de enero
    expect(Number(f.monto)).toBe(300); // 200 de la publicación + 2×50
  });

  it("en enero: un aviso creado, ninguna renovación", async () => {
    const [f] = await porCategoria("2026-01-01", "2026-01-31");
    expect(f.avisos).toBe(1);
    expect(f.renovaciones).toBe(0);
    expect(Number(f.monto)).toBe(100);
  });

  it("una categoría con dinero pero sin avisos nuevos NO desaparece", async () => {
    // Es la razón del FULL JOIN. Con un LEFT, un mes en el que solo hubo
    // renovaciones de avisos antiguos saldría vacío y el dinero se perdería —
    // justo el caso que se está arreglando.
    const filas = await porCategoria("2026-08-12", "2026-08-31");
    expect(filas).toHaveLength(1);
    expect(filas[0].avisos).toBe(0);
    expect(filas[0].renovaciones).toBe(2);
    expect(Number(filas[0].monto)).toBe(100);
  });
});

describe("qué cuenta como renovación", () => {
  it("se distingue por la descripción del movimiento", async () => {
    const filas = await q<{ es_renovacion: boolean; importe: string }>(
      `select es_renovacion, importe from public.gastos_de_avisos order by created_at`);
    expect(filas.map((f) => f.es_renovacion)).toEqual([false, false, true, true]);
  });

  it("no se le escapa por los acentos ni las mayúsculas", async () => {
    await db.exec(`insert into public.credit_transactions (type, credits, description, listing_id, created_at)
      values ('spend', -10, 'RENOVACION del aviso', '${AVISO_NUEVO}', '2026-08-25')`);
    const [f] = await porCategoria();
    expect(f.renovaciones).toBe(3);
  });

  it("las devoluciones y las compras de saldo no entran", async () => {
    // `gastos_de_avisos` solo mira los movimientos de tipo `spend` con aviso.
    await db.exec(`insert into public.credit_transactions (type, credits, description, listing_id, created_at)
      values ('purchase', 500, 'Compra de saldo', null, '2026-08-15'),
             ('refund', 50, 'Devolución', '${AVISO_NUEVO}', '2026-08-16')`);
    const [f] = await porCategoria();
    expect(Number(f.monto)).toBe(400);
  });
});
