// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  priceForDuration,
  extrasTotal,
  DURATION_OPTIONS,
  type ExtrasSelection,
  type DurationDays,
} from "@/lib/pricing";
import { applyDiscount } from "@/lib/promotions";

/**
 * 0091 — el precio de publicar lo calcula y lo cobra el servidor.
 *
 * Dos mitades, y las dos importan:
 *
 *  1. PARIDAD. El motor de precios existe ahora en SQL además de en TypeScript.
 *     Si se separan un céntimo, el usuario ve un precio y se le cobra otro. Se
 *     recorre la matriz entera comparando los dos.
 *
 *  2. EL AGUJERO, CERRADO. Antes publicar eran dos llamadas sueltas y el
 *     navegador decidía cuánto pagar.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG = read("0091_precio_en_el_servidor.sql");

const YO = "00000000-0000-0000-0000-0000000000a1";
const OTRO = "00000000-0000-0000-0000-0000000000b1";
const AVISO = "00000000-0000-0000-0000-00000000c001";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const como = (uid: string) => db.exec(`set role authenticated; set test.uid = '${uid}';`);
const comoSuper = () => db.exec(`reset role; set test.uid = '';`);
const num = async (sql: string) => Number((await q<{ v: string }>(`select (${sql})::text as v`))[0].v);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid $$;

    create function public.is_staff(uuid) returns boolean language sql stable as $$ select false $$;

    create table public.pricing_settings (
      id serial primary key, base numeric, desc_por_aviso numeric, desc_cantidad jsonb,
      saltos jsonb, extras jsonb, is_active boolean default true, updated_at timestamptz default now()
    );
    create table public.promotions (
      id serial primary key, name text, discount_pct numeric, starts_at timestamptz,
      ends_at timestamptz, category_ids text[] default '{}', is_active boolean default true
    );
    create table public.listings (
      id uuid primary key, owner_id uuid, category_id text, status text,
      published_at timestamptz, expires_at timestamptz,
      featured boolean default false, urgent boolean default false, confidential boolean default false,
      plan_duration_days int, plan_quantity int, plan_extras jsonb
    );
    create table public.user_credits (user_id uuid primary key, balance numeric, updated_at timestamptz);
    create table public.credit_transactions (
      id serial primary key, user_id uuid, type text, credits numeric,
      description text, listing_id uuid, order_id uuid
    );

    -- spend_credits tal como lo dejó 0071, con permiso para authenticated: 0091
    -- tiene que quitárselo.
    create function public.spend_credits(p_user_id uuid, p_credits numeric, p_listing_id uuid default null, p_description text default null)
      returns boolean language sql as $$ select true $$;
    grant execute on function public.spend_credits(uuid, numeric, uuid, text) to authenticated;

    grant select on public.pricing_settings, public.promotions to authenticated, anon;
    grant select, update on public.listings to authenticated;
    grant select, insert, update on public.user_credits to authenticated;
    grant select, insert on public.credit_transactions to authenticated;
    grant usage on sequence public.credit_transactions_id_seq to authenticated;
  `);
  await db.exec(MIG);

  // La tarifa por defecto del código, metida en la BD: así las dos
  // implementaciones parten exactamente de los mismos números.
  const s = DEFAULT_SETTINGS;
  await db.exec(`
    insert into public.pricing_settings (base, desc_por_aviso, desc_cantidad, saltos, extras, is_active)
    values (${s.base}, ${s.descPorAviso}, '${JSON.stringify(s.descCantidad)}'::jsonb,
            '${JSON.stringify(s.saltos)}'::jsonb, '${JSON.stringify(s.extras)}'::jsonb, true);
  `);
});

beforeEach(async () => {
  await comoSuper();
  await db.exec(`
    delete from public.credit_transactions;
    delete from public.promotions;
    delete from public.listings;
    insert into public.user_credits (user_id, balance, updated_at)
      values ('${YO}', 100000, now()), ('${OTRO}', 100000, now())
      on conflict (user_id) do update set balance = 100000;
  `);
});

// Deja un aviso en borrador listo para publicar.
const borrador = (extras: ExtrasSelection = {}, owner = YO, qty = 1) =>
  db.exec(`
    insert into public.listings (id, owner_id, category_id, status, plan_quantity, plan_extras)
    values ('${AVISO}', '${owner}', 'autos', 'draft', ${qty}, '${JSON.stringify(extras)}'::jsonb);
  `);

const saldo = (uid = YO) => num(`select balance from public.user_credits where user_id = '${uid}'`);

// Cuánto se cobró, leído del movimiento. Se pregunta a la BD en vez de restar
// saldos en JavaScript: 100000 − 99983.86 en coma flotante da 16.139999999…, y
// eso haría fallar la comparación por un problema de la prueba, no del cobro.
const cobrado = () => num(`select coalesce(-sum(credits), 0) from public.credit_transactions`);

// ─────────────────────────────────────────────────────────────────────
describe("0091 · el SQL y el TypeScript cobran lo mismo", () => {
  const COMBOS: ExtrasSelection[] = [
    {},
    { destacado: 1 },
    { urgente: 1 },
    { img500: 3 },
    { img500: 1, pdf500: 1 },
    { destacado: 1, urgente: 1, img500: 2 },
    { confidencial: 1 },
  ];

  it("el precio del aviso coincide en toda la matriz (10 cantidades × 6 duraciones)", async () => {
    const cfg = `public.effe_pricing()`;
    for (let n = 1; n <= 10; n++) {
      for (const d of DURATION_OPTIONS) {
        const sql = await num(`select public.effe_price_for_duration(${n}, ${d}, ${cfg})`);
        expect(sql, `${n} avisos × ${d} días`).toBe(priceForDuration(n, d, DEFAULT_SETTINGS));
      }
    }
  });

  it("los adicionales coinciden para cada combinación y cada duración", async () => {
    const cfg = `public.effe_pricing()`;
    for (const sel of COMBOS) {
      for (const d of DURATION_OPTIONS) {
        const sql = await num(
          `select public.effe_extras_total('${JSON.stringify(sel)}'::jsonb, ${d}, ${cfg})`,
        );
        expect(sql, `${JSON.stringify(sel)} a ${d} días`).toBe(extrasTotal(sel, d, DEFAULT_SETTINGS));
      }
    }
  });

  it("el costo total del aviso coincide con lo que enseña la pantalla", async () => {
    for (const sel of COMBOS) {
      for (const d of DURATION_OPTIONS) {
        await comoSuper();
        await db.exec(`delete from public.listings;`);
        await borrador(sel);
        const sql = await num(`select public.effe_listing_cost('${AVISO}', ${d})`);
        // La misma cuenta que hace AdvertiserPublish.
        const pantalla = Math.round(
          (priceForDuration(1, d as DurationDays, DEFAULT_SETTINGS)
            + extrasTotal(sel, d as DurationDays, DEFAULT_SETTINGS)) * 100,
        ) / 100;
        expect(sql, `${JSON.stringify(sel)} a ${d} días`).toBe(pantalla);
      }
    }
  });

  it("la promoción se descuenta igual que en el cliente", async () => {
    await borrador({ destacado: 1 });
    await db.exec(`
      insert into public.promotions (name, discount_pct, starts_at, ends_at, category_ids, is_active)
      values ('Verano', 30, now() - interval '1 day', now() + interval '1 day', '{autos}', true);
    `);
    const sql = await num(`select public.effe_listing_cost('${AVISO}', 30)`);
    const base = Math.round(
      (priceForDuration(1, 30, DEFAULT_SETTINGS) + extrasTotal({ destacado: 1 }, 30, DEFAULT_SETTINGS)) * 100,
    ) / 100;
    expect(sql).toBe(applyDiscount(base, 30));
  });

  it("una promoción caducada no descuenta nada", async () => {
    await borrador({ destacado: 1 });
    await db.exec(`
      insert into public.promotions (name, discount_pct, starts_at, ends_at, category_ids, is_active)
      values ('Vieja', 50, now() - interval '10 day', now() - interval '1 day', '{}', true);
    `);
    const conPromo = await num(`select public.effe_listing_cost('${AVISO}', 7)`);
    const sinPromo = Math.round(
      (priceForDuration(1, 7, DEFAULT_SETTINGS) + extrasTotal({ destacado: 1 }, 7, DEFAULT_SETTINGS)) * 100,
    ) / 100;
    expect(conPromo).toBe(sinPromo);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("0091 · publicar cobra lo que cuesta, no lo que diga el cliente", () => {
  it("descuenta el importe real del saldo del anunciante", async () => {
    await borrador({ destacado: 1 });
    await como(YO);
    await q(`select public.publish_listing('${AVISO}', 90)`);

    await comoSuper();
    const esperado = Math.round(
      (priceForDuration(1, 90, DEFAULT_SETTINGS) + extrasTotal({ destacado: 1 }, 90, DEFAULT_SETTINGS)) * 100,
    ) / 100;
    expect(await cobrado()).toBe(esperado);
    // Y con adicionales por día, 90 días de Destacado ya no son 5 soles.
    expect(extrasTotal({ destacado: 1 }, 90, DEFAULT_SETTINGS)).toBe(450);
  });

  it("el movimiento queda anotado en credit_transactions", async () => {
    await borrador({ urgente: 1 });
    await como(YO);
    await q(`select public.publish_listing('${AVISO}', 7)`);

    await comoSuper();
    const [mov] = await q<{ credits: string; type: string; listing_id: string }>(
      `select credits::text as credits, type, listing_id::text as listing_id from public.credit_transactions`,
    );
    expect(mov.type).toBe("spend");
    expect(mov.listing_id).toBe(AVISO);
    expect(Number(mov.credits)).toBeLessThan(0);
  });

  it("sin saldo NO se publica ni se cobra: la operación entera se deshace", async () => {
    await borrador({ destacado: 1 });
    await comoSuper();
    await db.exec(`update public.user_credits set balance = 1 where user_id = '${YO}';`);

    await como(YO);
    await expect(q(`select public.publish_listing('${AVISO}', 90)`)).rejects.toThrow(/saldo insuficiente/i);

    await comoSuper();
    // Ni un céntimo movido...
    expect(await saldo()).toBe(1);
    expect((await q(`select 1 from public.credit_transactions`)).length).toBe(0);
    // ...ni el aviso publicado. Antes podía quedar publicado y sin cobrar.
    const [l] = await q<{ status: string }>(`select status from public.listings where id = '${AVISO}'`);
    expect(l.status).toBe("draft");
  });

  it("vaciar plan_extras para no pagar deja el aviso SIN insignias", async () => {
    // El costo y las insignias salen de la MISMA columna: no se puede tener una
    // sin la otra.
    await borrador({});
    await como(YO);
    await q(`select public.publish_listing('${AVISO}', 30)`);

    await comoSuper();
    const [l] = await q<{ featured: boolean; urgent: boolean; confidential: boolean }>(
      `select featured, urgent, confidential from public.listings where id = '${AVISO}'`,
    );
    expect(l.featured).toBe(false);
    expect(l.urgent).toBe(false);
    expect(l.confidential).toBe(false);
    // Y solo pagó el aviso pelado.
    expect(await cobrado()).toBe(priceForDuration(1, 30, DEFAULT_SETTINGS));
  });

  it("una duración fuera de la tarifa se rechaza", async () => {
    // 364 días aplicaba todos los escalones (o sea, costaba como 90) pero duraba
    // cuatro veces más.
    await borrador({});
    await como(YO);
    await expect(q(`select public.publish_listing('${AVISO}', 364)`)).rejects.toThrow(/duración inválida/i);
    await expect(q(`select public.publish_listing('${AVISO}', 45)`)).rejects.toThrow(/duración inválida/i);
  });

  it("no se puede publicar el aviso de otro", async () => {
    await borrador({}, OTRO);
    await como(YO);
    await expect(q(`select public.publish_listing('${AVISO}', 7)`)).rejects.toThrow(/sin permiso/i);
    await comoSuper();
    expect(await saldo(OTRO)).toBe(100000);
  });

  it("republicar un aviso vencido vuelve a cobrar", async () => {
    await borrador({});
    await comoSuper();
    await db.exec(`update public.listings set status = 'expired' where id = '${AVISO}';`);
    await como(YO);
    await q(`select public.publish_listing('${AVISO}', 7)`);
    await comoSuper();
    expect(await cobrado()).toBe(priceForDuration(1, 7, DEFAULT_SETTINGS));
  });

  it("un aviso ACTIVO no se puede volver a publicar (sería vigencia gratis)", async () => {
    await borrador({});
    await comoSuper();
    await db.exec(`update public.listings set status = 'active' where id = '${AVISO}';`);
    await como(YO);
    await expect(q(`select public.publish_listing('${AVISO}', 90)`)).rejects.toThrow(/sin permiso/i);
  });

  it("el navegador ya no puede llamar a spend_credits", async () => {
    await como(YO);
    await expect(q(`select public.spend_credits('${YO}', 0.01, null, 'trampa')`))
      .rejects.toThrow(/permission denied/i);
  });
});
