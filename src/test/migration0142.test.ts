// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0142 — los cobros por Yape y Plin son ingresos.
 *
 * LO QUE REPORTÓ EL CLIENTE: "en Ingresos no cuadra... el usuario crea un aviso
 * con Yape o Plin y lo apruebo desde el admin, y no se está modificando el monto
 * de ingresos".
 *
 * Y era verdad. El filtro decía `payment_provider = 'izipay'`, que era correcto
 * cuando lo puso la 0094 —entonces la pasarela era la única forma de cobrar— y
 * dejó de serlo el 19-ago, cuando la 0117 añadió el cobro manual por billetera.
 * Nadie volvió a estas dos funciones. En producción eran S/ 3.608,54 de dinero
 * cobrado que el panel no enseñaba en ninguna parte.
 *
 * La otra mitad de lo que reportó NO es un fallo, y esta prueba lo fija para que
 * no se "arregle" por error: otorgar saldo desde el panel no es un ingreso —no
 * entra dinero, se regala crédito— y contarlo sería volver al problema que
 * arregló la 0094, cuando la tarjeta decía S/ 5.373,74 con S/ 145,77 cobrados.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0142_los_cobros_por_yape_y_plin_son_ingresos.sql"),
  "utf8",
);

const STAFF  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VECINO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const num = async (sql: string) =>
  Number((await q<{ v: string }>(`select (${sql})::text as v`))[0].v);

/** Una orden pagada. `ref` a null imita las órdenes viejas sin referencia. */
const orden = (
  proveedor: string | null,
  total: number,
  opciones: { estado?: string; ref?: string | null; cuando?: string } = {},
) => {
  const { estado = "paid", ref = "REF-123", cuando = "now()" } = opciones;
  return db.exec(`
    insert into public.orders (id, user_id, total, status, payment_provider, payment_ref, paid_at, created_at)
    values (gen_random_uuid(), '${VECINO}', ${total}, '${estado}',
            ${proveedor === null ? "null" : `'${proveedor}'`},
            ${ref === null ? "null" : `'${ref}'`}, ${cuando}, ${cuando});
  `);
};

const ingresos = () => num("select coalesce(sum(total), 0) from public.cobros_reales");

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as 'select ''${STAFF}''::uuid';
    -- coalesce a false porque el is_staff real devuelve FALSE con un usuario
    -- nulo, no NULL (comprobado contra producción). Ver la 0139.
    create function public.is_staff(p_user uuid) returns boolean language sql stable as
      'select coalesce($1 = ''${STAFF}''::uuid, false)';

    create table public.orders (
      id uuid primary key, user_id uuid, total numeric, status text,
      payment_provider text, payment_ref text,
      paid_at timestamptz, created_at timestamptz default now()
    );
    create table public.profiles (id uuid primary key, created_at timestamptz default now());
    create table public.listings (
      id uuid primary key default gen_random_uuid(), status text,
      published_at timestamptz, expires_at timestamptz, updated_at timestamptz default now(),
      created_at timestamptz default now()
    );
    create table public.reports (
      id uuid primary key default gen_random_uuid(), status text,
      created_at timestamptz default now(), resolved_at timestamptz
    );
    create table public.job_applications (
      id uuid primary key default gen_random_uuid(), created_at timestamptz default now()
    );
  `);
  await db.exec(MIG);
});

beforeEach(() => db.exec("delete from public.orders"));

describe("qué cuenta como ingreso", () => {
  it("la pasarela, como siempre", async () => {
    await orden("izipay", 100);
    expect(await ingresos()).toBe(100);
  });

  it("Y LA BILLETERA, que era lo que faltaba", async () => {
    // El fallo entero: alguien paga por Yape, el equipo comprueba el voucher y
    // lo aprueba, y ese dinero no aparecía en ninguna parte del panel.
    await orden("yape", 200);
    await orden("plin", 50);
    expect(await ingresos()).toBe(250);
  });

  it("los tres juntos suman", async () => {
    await orden("izipay", 100);
    await orden("yape", 200);
    await orden("plin", 50);
    expect(await ingresos()).toBe(350);
  });
});

describe("qué NO cuenta, y por qué", () => {
  it("el saldo que ya se había comprado: sería cobrar dos veces", async () => {
    // Una orden pagada con saldo (`creditos`) no trae dinero nuevo: el dinero
    // entró cuando se compró ese saldo, y ya se contó entonces.
    await orden("creditos", 500);
    expect(await ingresos()).toBe(0);
  });

  it("las pruebas simuladas", async () => {
    await orden("izipay", 999, { ref: "SIMULADO" });
    expect(await ingresos()).toBe(0);
  });

  it("el backfill histórico", async () => {
    await orden("backfill", 300);
    expect(await ingresos()).toBe(0);
  });

  it("una orden sin referencia de transacción", async () => {
    // Son las anteriores al 12-ago. Se quedan fuera como desde la 0094: no hay
    // forma de saber si llegaron a cobrarse.
    await orden("izipay", 400, { ref: null });
    await orden(null, 400);
    expect(await ingresos()).toBe(0);
  });

  it("una orden que no está pagada", async () => {
    await orden("yape", 700, { estado: "failed" });
    await orden("izipay", 700, { estado: "refunded" });
    expect(await ingresos()).toBe(0);
  });

  it("y el saldo otorgado por un admin, que ni siquiera crea orden", async () => {
    // ESTO ES DELIBERADO Y NO HAY QUE "ARREGLARLO". Regalar crédito no es un
    // ingreso: no entra dinero. Contarlo fue el problema que resolvió la 0094 —
    // la tarjeta decía S/ 5.373,74 con S/ 145,77 cobrados de verdad.
    expect(await ingresos()).toBe(0);
  });
});

describe("la tarjeta del panel y el gráfico dicen LO MISMO", () => {
  it("porque los dos leen la misma vista", async () => {
    await orden("izipay", 100);
    await orden("yape", 200);

    const tarjeta = await num("select (public.admin_stats()->>'revenue')::numeric");
    const grafico = await num(
      "select coalesce(sum(ingresos), 0) from public.admin_growth_series('12m')",
    );
    expect(tarjeta).toBe(300);
    expect(grafico).toBe(300);
  });

  it("el filtro está en UN sitio, no copiado en cada función", () => {
    // Es la causa de que Yape y Plin se quedaran fuera de las dos a la vez: el
    // filtro estaba escrito a mano en cada una. El día que entre otra forma de
    // cobrar, se añade a la vista y las dos pantallas se enteran solas.
    const cuerpoFunciones = MIG.slice(MIG.indexOf("create or replace function"));
    expect(cuerpoFunciones).not.toContain("payment_provider");
    expect(MIG.match(/payment_provider in \('izipay', 'yape', 'plin'\)/g)).toHaveLength(1);
  });
});

describe("el rango de fechas del gráfico", () => {
  it("cada cobro cae en el mes en que se COBRÓ", async () => {
    // No en el que se creó el carrito. Lo arregló la 0132 para los avisos y
    // aquí se conserva: `cobrado_at` es `coalesce(paid_at, created_at)`.
    await orden("yape", 100, { cuando: "now() - interval '2 months'" });
    await orden("yape", 50);
    const filas = await q<{ mes: string; ingresos: string }>(
      "select mes, ingresos from public.admin_growth_series('6m')",
    );
    const conDinero = filas.filter((f) => Number(f.ingresos) > 0);
    expect(conDinero).toHaveLength(2);
    expect(conDinero.map((f) => Number(f.ingresos)).sort((a, b) => a - b)).toEqual([50, 100]);
  });
});

describe("quién puede leer la facturación", () => {
  it("la vista NO está al alcance de la llave anónima", async () => {
    // Una vista nueva en `public` nace con ALL para anon/authenticated (los
    // `alter default privileges` de Supabase) y ADEMÁS corre con los permisos de
    // su dueño, así que se salta la RLS de `orders`. Sin el revoke, cualquiera
    // con la llave anónima —que viaja en el paquete de la web— leería la
    // facturación entera. Ver la 0137.
    for (const rol of ["anon", "authenticated"]) {
      const [{ ok }] = await q<{ ok: boolean }>(
        `select has_table_privilege('${rol}', 'public.cobros_reales', 'select') as ok`,
      );
      expect(ok).toBe(false);
    }
  });

  it("y quien no es personal no recibe cifras", async () => {
    await orden("izipay", 100);
    await db.exec("create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';");
    const [{ j }] = await q<{ j: Record<string, unknown> }>("select public.admin_stats() as j");
    expect(j).toEqual({});
    const filas = await q("select * from public.admin_growth_series('6m')");
    expect(filas).toHaveLength(0);
    await db.exec(`create or replace function auth.uid() returns uuid language sql stable as 'select ''${STAFF}''::uuid';`);
  });
});
