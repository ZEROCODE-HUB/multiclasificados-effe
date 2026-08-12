// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0090 — `settle_paid_order` deja de ser invocable sin ser el webhook.
 *
 * La 0071 revocó `add_credits` de PUBLIC/anon/authenticated pero se saltó a la
 * función hermana: `settle_paid_order` es SECURITY DEFINER, su único guard es
 * `status <> 'paid'` y conservaba el EXECUTE que Postgres concede a PUBLIC al
 * crear cualquier función. Con solo la anon key —la que va dentro del bundle
 * público, sin ninguna sesión— se podía marcar una orden como pagada, acreditar
 * los créditos y disparar un comprobante a SUNAT por un pago que nunca ocurrió.
 *
 * Esta prueba existe para que el revoke no se pierda. El riesgo real es una
 * migración futura que haga DROP + CREATE de la función: `create or replace`
 * conserva los permisos, pero recrearla desde cero devuelve el default de
 * PUBLIC y el agujero vuelve sin que nadie lo note.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0090 = read("0090_harden_settle_paid_order.sql");

const ORDEN = "00000000-0000-0000-0000-00000000d001";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const como = (rol: string) => db.exec(`set role ${rol};`);
const comoSuper = () => db.exec(`reset role;`);
const llamar = () => q(`select public.settle_paid_order('${ORDEN}'::uuid, 'ref-falsa')`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;

    -- La función tal como estaba: SECURITY DEFINER y con el EXECUTE que Postgres
    -- concede a PUBLIC por defecto. No se le da ningún grant explícito, que es
    -- justo el punto: el agujero venía del default, no de un grant.
    create function public.settle_paid_order(p_order uuid, p_ref text)
      returns jsonb language sql security definer
      as $$ select jsonb_build_object('settled', true) $$;
  `);
});

describe("0090 — settle_paid_order solo para el webhook", () => {
  it("ANTES de la migración, cualquiera podía liquidar una orden", async () => {
    // Se comprueba primero el agujero: si esto no pasara, la prueba de abajo
    // estaría verde sin demostrar nada.
    await como("anon");
    const [r] = await llamar() as Array<{ settle_paid_order: { settled: boolean } }>;
    expect(r.settle_paid_order.settled).toBe(true);
    await comoSuper();
  });

  it("después de la migración, `anon` ya no puede llamarla", async () => {
    await db.exec(MIG_0090);
    await como("anon");
    await expect(llamar()).rejects.toThrow(/permission denied/i);
    await comoSuper();
  });

  it("un usuario con sesión tampoco: no es cosa de estar autenticado", async () => {
    await como("authenticated");
    await expect(llamar()).rejects.toThrow(/permission denied/i);
    await comoSuper();
  });

  it("el webhook sí, que es la única vía legítima", async () => {
    await como("service_role");
    const [r] = await llamar() as Array<{ settle_paid_order: { settled: boolean } }>;
    expect(r.settle_paid_order.settled).toBe(true);
    await comoSuper();
  });

  it("`create or replace` conserva el revoke; recrearla desde cero NO", async () => {
    // La nota al pie de la migración, comprobada. Es la forma realista de que
    // esto se rompa: alguien reescribe la función en una migración futura.
    await db.exec(`
      create or replace function public.settle_paid_order(p_order uuid, p_ref text)
        returns jsonb language sql security definer
        as $$ select jsonb_build_object('settled', true, 'v', 2) $$;
    `);
    await como("anon");
    await expect(llamar()).rejects.toThrow(/permission denied/i);
    await comoSuper();

    // Y el aviso de la migración es cierto: con drop + create vuelve el default.
    await db.exec(`
      drop function public.settle_paid_order(uuid, text);
      create function public.settle_paid_order(p_order uuid, p_ref text)
        returns jsonb language sql security definer
        as $$ select jsonb_build_object('settled', true) $$;
    `);
    await como("anon");
    const [r] = await llamar() as Array<{ settle_paid_order: { settled: boolean } }>;
    expect(r.settle_paid_order.settled).toBe(true);
    await comoSuper();
  });
});
