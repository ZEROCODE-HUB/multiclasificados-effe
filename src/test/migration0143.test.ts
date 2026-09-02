// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0143 — el saldo otorgado que SÍ fue un cobro.
 *
 * LO QUE REPORTÓ EL CLIENTE: "acabo de otorgar saldo a un usuario, y no se
 * aumentó el monto del gráfico". Y detrás hay algo real: el equipo usa "otorgar
 * saldo" para registrar dinero que entró por fuera —una transferencia, efectivo—
 * y ese dinero no se veía en ninguna parte.
 *
 * PERO NO SE PUEDEN CONTAR TODOS. "Otorgar saldo" se usa para dos cosas que no
 * se parecen: registrar un cobro y regalar crédito o hacer una prueba. En
 * producción hay 188.911 créditos otorgados en agosto con motivos como "Prueba
 * de QA tras migración 0108"; contarlos llevaría "Ingresos" de S/ 24.732 a más
 * de S/ 226.000. Sería repetir el problema que arregló la 0094.
 *
 * Por eso se marca al mover el saldo, y esta prueba fija las dos mitades: que lo
 * marcado cuenta y que lo NO marcado no.
 */
const MIG_0142 = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0142_los_cobros_por_yape_y_plin_son_ingresos.sql"),
  "utf8",
);
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0143_el_saldo_que_si_fue_un_cobro.sql"),
  "utf8",
);

const STAFF  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VECINO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const num = async (sql: string) =>
  Number((await q<{ v: string }>(`select (${sql})::text as v`))[0].v);

const ingresos = () => num("select coalesce(sum(total), 0) from public.cobros_reales");
const saldo = () => num(`select coalesce(balance, 0) from public.user_credits where user_id = '${VECINO}'`);

/** Mueve el saldo como lo hace el panel. `medio` null = regalo o prueba. */
const mover = (delta: number, motivo: string, medio: string | null = null) =>
  db.exec(
    `select public.admin_ajustar_saldo('${VECINO}', ${delta}, '${motivo}', ` +
    `${medio === null ? "null" : `'${medio}'`});`,
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(`
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as 'select ''${STAFF}''::uuid';
    create function public.is_staff(p_user uuid) returns boolean language sql stable as
      'select coalesce($1 = ''${STAFF}''::uuid, false)';
    -- El permiso lo comprueba la propia función; aquí se concede siempre.
    create function public.has_perm(p_modulo text, p_accion text) returns boolean
      language sql stable as 'select true';

    create table public.orders (
      id uuid primary key default gen_random_uuid(), user_id uuid, total numeric, status text,
      payment_provider text, payment_ref text,
      paid_at timestamptz, created_at timestamptz default now()
    );
    create table public.credit_transactions (
      id uuid primary key default gen_random_uuid(), user_id uuid not null, type text not null,
      credits numeric not null, description text, listing_id uuid, order_id uuid,
      created_at timestamptz not null default now()
    );
    create table public.user_credits (
      user_id uuid primary key, balance numeric not null default 0 check (balance >= 0),
      updated_at timestamptz default now()
    );
    create table public.audit_logs (
      id uuid primary key default gen_random_uuid(), actor_id uuid, action text,
      entity_type text, entity_id uuid, metadata jsonb, created_at timestamptz default now()
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

    insert into public.profiles (id) values ('${VECINO}'), ('${STAFF}');
  `);
  // La 0142 crea la vista y las funciones; la 0143 las rehace con la marca.
  await db.exec(MIG_0142);
  await db.exec(MIG);
});

beforeEach(() => db.exec(`
  delete from public.orders;
  delete from public.credit_transactions;
  delete from public.audit_logs;
  delete from public.user_credits;
`));

describe("lo que el equipo marca como cobro SÍ es ingreso", () => {
  it("otorgar saldo marcado suma", async () => {
    // Es lo que reportó el cliente: registró un cobro por fuera y la cifra no
    // se movía.
    await mover(300, "Transferencia del cliente", "transferencia");
    expect(await ingresos()).toBe(300);
  });

  it("y el saldo del usuario sube igual", async () => {
    // Marcar el cobro no cambia lo que recibe el usuario, solo la contabilidad.
    await mover(300, "Transferencia del cliente", "transferencia");
    expect(await saldo()).toBe(300);
  });

  it("QUITAR saldo marcado RESTA, sin ninguna regla aparte", async () => {
    // El signo lo pone el propio movimiento. Devolverle el dinero a alguien
    // descuenta del ingreso, que es justo lo que debe pasar.
    await mover(300, "Transferencia del cliente", "transferencia");
    await mover(-100, "Le devolví parte", "transferencia");
    expect(await ingresos()).toBe(200);
    expect(await saldo()).toBe(200);
  });

  it("acepta los medios de la lista y rechaza lo demás", async () => {
    await mover(10, "Efectivo en oficina", "efectivo");
    await mover(10, "Yape directo", "yape");
    expect(await ingresos()).toBe(20);
    await expect(mover(10, "Con conchas marinas", "trueque"))
      .rejects.toThrow(/medio de cobro no válido/i);
  });
});

describe("lo que NO se marca NO es ingreso", () => {
  it("un regalo no toca la cifra", async () => {
    // Y es la mitad importante: sin esto, los 188.911 créditos regalados en
    // agosto entrarían en "Ingresos".
    await mover(500, "Cliente nuevo, cortesía");
    expect(await ingresos()).toBe(0);
    expect(await saldo()).toBe(500);
  });

  it("una prueba de QA tampoco", async () => {
    await mover(100000, "Prueba de QA");
    expect(await ingresos()).toBe(0);
  });

  it("el regalo y el cobro conviven sin mezclarse", async () => {
    await mover(500, "Cortesía");
    await mover(300, "Transferencia", "transferencia");
    await mover(200, "Otra cortesía");
    expect(await ingresos()).toBe(300);
    expect(await saldo()).toBe(1000);
  });

  it("lo otorgado ANTES de la marca se queda fuera", async () => {
    // Reetiquetar dos meses de historial a mano sería inventarse la
    // contabilidad. Un movimiento sin `cobro_medio` no cuenta, y los viejos no
    // lo tienen.
    await db.exec(`
      insert into public.credit_transactions (user_id, type, credits, description)
      values ('${VECINO}', 'purchase', 188911, 'Otorgado por admin: Prueba de QA tras migracion 0108');
    `);
    expect(await ingresos()).toBe(0);
  });
});

describe("lo que ya funcionaba sigue funcionando", () => {
  it("las órdenes cobradas por la plataforma siguen contando", async () => {
    await db.exec(`
      insert into public.orders (user_id, total, status, payment_provider, payment_ref, paid_at)
      values ('${VECINO}', 100, 'paid', 'izipay', 'REF-1', now()),
             ('${VECINO}', 200, 'paid', 'yape',   'YAPE-PLIN', now());
    `);
    expect(await ingresos()).toBe(300);
  });

  it("y se suman a los cobros por fuera", async () => {
    await db.exec(`
      insert into public.orders (user_id, total, status, payment_provider, payment_ref, paid_at)
      values ('${VECINO}', 100, 'paid', 'izipay', 'REF-1', now());
    `);
    await mover(50, "Transferencia", "transferencia");
    expect(await ingresos()).toBe(150);

    const tarjeta = await num("select (public.admin_stats()->>'revenue')::numeric");
    const grafico = await num("select coalesce(sum(ingresos), 0) from public.admin_growth_series('12m')");
    expect(tarjeta).toBe(150);
    expect(grafico).toBe(150);
  });

  it("el motivo sigue siendo obligatorio: es dinero", async () => {
    await expect(mover(100, "   ", "transferencia")).rejects.toThrow(/motivo es obligatorio/i);
  });

  it("y no se puede dejar el saldo en negativo", async () => {
    await mover(50, "Cortesía");
    await expect(mover(-80, "Retiro excesivo")).rejects.toThrow(/solo tiene/i);
  });
});

describe("queda rastro de si hubo dinero", () => {
  it("el medio se guarda en el movimiento", async () => {
    await mover(300, "Transferencia del cliente", "transferencia");
    const [{ medio }] = await q<{ medio: string }>(
      "select cobro_medio as medio from public.credit_transactions limit 1",
    );
    expect(medio).toBe("transferencia");
  });

  it("y también en la auditoría", async () => {
    // Es la diferencia entre un regalo y un cobro: tiene que poder rastrearse
    // sin depender de cómo alguien redactó el motivo.
    await mover(300, "Transferencia del cliente", "transferencia");
    const [{ medio }] = await q<{ medio: string }>(
      "select metadata->>'cobro_medio' as medio from public.audit_logs limit 1",
    );
    expect(medio).toBe("transferencia");
  });

  it("un regalo lo deja en null, no en cadena vacía", async () => {
    // "" y null significan lo mismo para una persona y NO para la vista.
    await db.exec(`select public.admin_ajustar_saldo('${VECINO}', 100, 'Cortesía', '   ');`);
    const [{ medio }] = await q<{ medio: string | null }>(
      "select cobro_medio as medio from public.credit_transactions limit 1",
    );
    expect(medio).toBeNull();
    expect(await ingresos()).toBe(0);
  });
});

describe("quién puede llamarla", () => {
  it("la vista sigue cerrada a la llave anónima", async () => {
    // La 0143 rehace la vista con DROP + CREATE, así que vuelve a nacer con los
    // privilegios por defecto de Supabase. Si el revoke se olvidara, la
    // facturación entera quedaría al alcance de cualquiera.
    for (const rol of ["anon", "authenticated"]) {
      const [{ ok }] = await q<{ ok: boolean }>(
        `select has_table_privilege('${rol}', 'public.cobros_reales', 'select') as ok`,
      );
      expect(ok).toBe(false);
    }
  });

  it("y la función recuperó su EXECUTE tras el DROP", async () => {
    // Es lo que se pierde con un DROP + CREATE (ver la 0136). Sin esto, mover
    // el saldo desde el panel devuelve un 42501.
    const [{ ok }] = await q<{ ok: boolean }>(
      "select has_function_privilege('authenticated', 'public.admin_ajustar_saldo(uuid,numeric,text,text)', 'execute') as ok",
    );
    expect(ok).toBe(true);
  });

  it("pero no la llave anónima", async () => {
    const [{ ok }] = await q<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.admin_ajustar_saldo(uuid,numeric,text,text)', 'execute') as ok",
    );
    expect(ok).toBe(false);
  });
});
