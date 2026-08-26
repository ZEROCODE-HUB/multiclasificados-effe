// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0123 — el Reporte de Transacciones dice por dónde entró el dinero.
 *
 * Lo que de verdad hay que vigilar aquí no es que traiga el dato, sino que al
 * traerlo **no se pierda ninguna fila**. La unión con `orders` tiene que ser
 * LEFT: un gasto no tiene orden, y con INNER desaparecerían del historial justo
 * los movimientos que explican en qué se fue el saldo. En un registro financiero
 * eso es mucho peor que no tener la columna.
 *
 * Y el otro seguro: la función CAMBIA de tipo de retorno, así que hay que
 * soltarla y recrearla — y al soltarla se pierde el permiso. Sin volver a
 * concederlo, el reporte sale vacío en producción sin decir por qué.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0123_transacciones_con_modo_de_pago.sql"),
  "utf8",
);

const YO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const filas = () =>
  q<{ description: string; type: string; payment_provider: string | null }>(
    `select description, type, payment_provider from public.admin_credit_transactions(null, null, null, null, 100, 0)`,
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;

    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);

    create table public.profiles (id uuid primary key, full_name text, email text);
    create table public.listings (id uuid primary key default gen_random_uuid(), title text);
    create table public.orders (
      id uuid primary key default gen_random_uuid(),
      payment_provider text
    );
    create table public.credit_transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid, type text, credits numeric,
      description text, listing_id uuid, order_id uuid,
      created_at timestamptz not null default now()
    );

    -- El permiso lo comprueba la propia funcion; aqui se deja en true para
    -- poder probar lo demas.
    create or replace function public.has_perm(a text, b text)
    returns boolean language sql stable as $$ select true $$;

    insert into public.profiles (id, full_name, email) values ('${YO}', 'Ana', 'ana@x.com');

    -- Una compra por cada via, y un gasto (que NO tiene orden).
    insert into public.orders (id, payment_provider) values
      ('11111111-1111-4111-8111-111111111111', 'izipay'),
      ('22222222-2222-4222-8222-222222222222', 'yape'),
      ('33333333-3333-4333-8333-333333333333', 'plin'),
      ('44444444-4444-4444-8444-444444444444', null);

    insert into public.credit_transactions (user_id, type, credits, description, order_id) values
      ('${YO}', 'purchase',  50, 'Con tarjeta',      '11111111-1111-4111-8111-111111111111'),
      ('${YO}', 'purchase',  30, 'Con Yape',         '22222222-2222-4222-8222-222222222222'),
      ('${YO}', 'purchase',  20, 'Con Plin',         '33333333-3333-4333-8333-333333333333'),
      ('${YO}', 'purchase',  10, 'Orden sin medio',  '44444444-4444-4444-8444-444444444444'),
      ('${YO}', 'purchase',  15, 'Compra antigua',   null),
      ('${YO}', 'spend',    -16, 'Publicar un aviso', null);
  `);
  await db.exec(MIG);
});

describe("0123 · el modo de pago llega al reporte", () => {
  it("cada compra trae el medio con el que se pagó", async () => {
    const f = await filas();
    const medio = (d: string) => f.find((r) => r.description === d)?.payment_provider;
    expect(medio("Con tarjeta")).toBe("izipay");
    expect(medio("Con Yape")).toBe("yape");
    expect(medio("Con Plin")).toBe("plin");
  });

  it("una orden sin medio registrado viaja en blanco, no inventa uno", async () => {
    const f = await filas();
    expect(f.find((r) => r.description === "Orden sin medio")?.payment_provider).toBeNull();
  });
});

describe("0123 · y no se pierde ni una fila por el camino", () => {
  it("siguen saliendo LAS SEIS: la unión con órdenes no descarta nada", async () => {
    // Este es el fallo que se evita. Con un INNER JOIN, el gasto y la compra
    // antigua desaparecerían del historial — y son movimientos de dinero.
    expect(await filas()).toHaveLength(6);
  });

  it("el gasto sigue estando aunque no tenga orden", async () => {
    const f = await filas();
    const gasto = f.find((r) => r.description === "Publicar un aviso");
    expect(gasto).toBeTruthy();
    expect(gasto!.type).toBe("spend");
    expect(gasto!.payment_provider).toBeNull();
  });

  it("y una compra antigua sin orden, también", async () => {
    expect((await filas()).some((r) => r.description === "Compra antigua")).toBe(true);
  });

  it("el total sigue contando todo, que es lo que pagina la pantalla", async () => {
    const [{ total_count }] = await q<{ total_count: string }>(
      `select total_count::text from public.admin_credit_transactions(null, null, null, null, 2, 0) limit 1`,
    );
    expect(Number(total_count)).toBe(6);
  });

  it("los filtros de siempre siguen funcionando", async () => {
    const solo = await q<{ description: string }>(
      `select description from public.admin_credit_transactions(null, 'spend', null, null, 100, 0)`,
    );
    expect(solo.map((r) => r.description)).toEqual(["Publicar un aviso"]);
  });
});

describe("0123 · el permiso, que se pierde al recrearla", () => {
  it("authenticated puede ejecutarla: si no, el reporte sale vacío sin decir por qué", async () => {
    const [{ v }] = await q<{ v: string }>(
      `select has_function_privilege('authenticated',
         'public.admin_credit_transactions(text, text, timestamptz, timestamptz, integer, integer)',
         'execute')::text as v`,
    );
    expect(v).toBe("true");
  });

  it("y anon no: es un dato financiero de todos los usuarios", async () => {
    const [{ v }] = await q<{ v: string }>(
      `select has_function_privilege('anon',
         'public.admin_credit_transactions(text, text, timestamptz, timestamptz, integer, integer)',
         'execute')::text as v`,
    );
    expect(v).toBe("false");
  });
});
