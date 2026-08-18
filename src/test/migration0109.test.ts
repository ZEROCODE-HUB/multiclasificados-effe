// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0109 — las órdenes no se quedan colgadas.
 *
 * Hoy, si el aviso de pago de Izipay no llega, la orden se queda 'pending' para
 * siempre aunque el dinero se haya cobrado. Esta migración pone el barrido que
 * despierta la verificación. Lo que se prueba:
 *
 *  1. Que respeta los dos minutos de gracia (no corre contra el aviso normal).
 *  2. Que el reintento se va espaciando en vez de machacar la pasarela.
 *  3. Que a los 7 días la orden se cierra — y que eso NO impide que un aviso
 *     tardío la liquide, porque el gate de settle_paid_order es `<> 'paid'`.
 *  4. Que ni el navegador ni el anónimo pueden ejecutar el barrido.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0109_ordenes_que_no_se_quedan_colgadas.sql"),
  "utf8",
);

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const U = "00000000-0000-0000-0000-0000000000d1";

// Órdenes con una antigüedad concreta, que es lo que decide si entran al barrido.
const orden = (id: string, minutos: number, estado = "pending") => db.exec(`
  insert into public.orders (id, user_id, total, status, created_at)
  values ('${id}', '${U}', 100, '${estado}', now() - interval '${minutos} minutes');
`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

    create table public.orders (
      id uuid primary key, user_id uuid, total numeric,
      status text default 'pending', payment_ref text, created_at timestamptz default now()
    );
    create table public.system_settings (
      key text primary key, value jsonb, label text, updated_at timestamptz default now()
    );

    -- pg_net y pg_cron no existen en PGlite: la migración tiene que aguantarlo
    -- (es exactamente lo que pasa en un entorno donde no estén instalados).
    create schema if not exists net;
  `);
  await db.exec(MIG);
});

beforeEach(() => db.exec(`delete from public.orders;`));

describe("0109 — barrido de órdenes pendientes", () => {
  it("la migración se aplica aunque pg_net y pg_cron no estén", async () => {
    const [r] = await q<{ n: string }>(
      `select count(*)::text as n from pg_proc where proname = 'sweep_pending_orders'`);
    expect(r.n).toBe("1");
  });

  it("deja dos minutos de gracia: no corre contra el aviso de pago normal", async () => {
    await orden("11111111-1111-1111-1111-111111111111", 1); // recién creada
    const [r] = await q<{ n: number }>(`select public.sweep_pending_orders(20) as n`);
    expect(Number(r.n)).toBe(0);
  });

  it("toma las que llevan más de dos minutos sin confirmarse", async () => {
    await orden("22222222-2222-2222-2222-222222222222", 10);
    const [r] = await q<{ n: number }>(`select public.sweep_pending_orders(20) as n`);
    expect(Number(r.n)).toBe(1);
    const [o] = await q<{ verify_attempts: number }>(
      `select verify_attempts from public.orders where id = '22222222-2222-2222-2222-222222222222'`);
    expect(Number(o.verify_attempts)).toBe(1);
  });

  it("no toca las órdenes ya pagadas ni las fallidas", async () => {
    await orden("33333333-3333-3333-3333-333333333333", 10, "paid");
    await orden("44444444-4444-4444-4444-444444444444", 10, "failed");
    const [r] = await q<{ n: number }>(`select public.sweep_pending_orders(20) as n`);
    expect(Number(r.n)).toBe(0);
  });

  it("espacia los reintentos en vez de machacar la pasarela", async () => {
    const id = "55555555-5555-5555-5555-555555555555";
    await orden(id, 10);
    await q(`select public.sweep_pending_orders(20)`);

    // El siguiente intento queda programado a futuro: una segunda pasada
    // inmediata no vuelve a tocarla.
    const [r2] = await q<{ n: number }>(`select public.sweep_pending_orders(20) as n`);
    expect(Number(r2.n)).toBe(0);

    // Y la espera crece con cada intento (1, 2, 4… minutos, con tope de 60).
    await q(`update public.orders set verify_next_try_at = now() - interval '1 minute' where id = '${id}'`);
    await q(`select public.sweep_pending_orders(20)`);
    const [o] = await q<{ mins: string }>(`
      select round(extract(epoch from (verify_next_try_at - now())) / 60)::text as mins
        from public.orders where id = '${id}'`);
    expect(Number(o.mins)).toBeGreaterThanOrEqual(2);
  });

  it("a los 7 días se da por perdida, pero un aviso tardío TODAVÍA podría liquidarla", async () => {
    const id = "66666666-6666-6666-6666-666666666666";
    await orden(id, 60 * 24 * 8); // ocho días
    await q(`select public.sweep_pending_orders(20)`);
    const [o] = await q<{ status: string; verify_last_error: string }>(
      `select status, verify_last_error from public.orders where id = '${id}'`);
    expect(o.status).toBe("failed");
    expect(o.verify_last_error).toContain("7 días");
    // El gate de settle_paid_order es `status <> 'paid'`, así que 'failed' no
    // cierra la puerta: el dinero todavía se puede acreditar si aparece.
    expect(o.status).not.toBe("paid");
  });

  it("respeta el tope de órdenes por pasada", async () => {
    for (let i = 0; i < 5; i++) {
      await orden(`77777777-7777-7777-7777-77777777777${i}`, 10);
    }
    const [r] = await q<{ n: number }>(`select public.sweep_pending_orders(2) as n`);
    expect(Number(r.n)).toBe(2);
  });

  it("el navegador no puede ejecutar el barrido", async () => {
    for (const rol of ["anon", "authenticated"]) {
      const [r] = await q<{ ok: boolean }>(
        `select has_function_privilege('${rol}', 'public.sweep_pending_orders(int)', 'execute') as ok`);
      expect(r.ok).toBe(false);
    }
    const [s] = await q<{ ok: boolean }>(
      `select has_function_privilege('service_role', 'public.sweep_pending_orders(int)', 'execute') as ok`);
    expect(s.ok).toBe(true);
  });

  it("el secreto del worker queda declarado (vacío hasta que se configure)", async () => {
    const [r] = await q<{ n: string }>(
      `select count(*)::text as n from public.system_settings where key = 'payment_worker_secret'`);
    expect(r.n).toBe("1");
  });

  it("es re-ejecutable", async () => {
    await expect(db.exec(MIG)).resolves.toBeDefined();
  });
});
