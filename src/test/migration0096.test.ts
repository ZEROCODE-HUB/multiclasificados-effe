// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS } from "@/lib/pricing";

/**
 * 0096 — pagar y publicar.
 *
 * Cuando la orden viene atada a un aviso, liquidar el pago tiene que dejar tres
 * cosas hechas sin que el usuario vuelva a tocar nada: acreditar lo pagado,
 * emitir el comprobante y PUBLICAR el aviso. Lo que se prueba aquí:
 *
 *  1. Que publica de verdad, y que el cobro sale completo (se acredita lo que
 *     faltaba y se descuenta el costo entero del aviso).
 *  2. Que si publicar falla, el dinero NO se pierde: la orden queda liquidada,
 *     el saldo acreditado y el comprobante emitido igual. Es la garantía que
 *     sostiene todo lo demás.
 *  3. Que `effe_publish_listing` —que publica en nombre de cualquiera— no queda
 *     al alcance del navegador. Es el mismo descuido que abrió el agujero de
 *     `settle_paid_order` entre la 0061 y la 0090.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0091 = read("0091_precio_en_el_servidor.sql");
const MIG_0096 = read("0096_pagar_y_publicar.sql");

const YO = "00000000-0000-0000-0000-0000000000a1";
const OTRO = "00000000-0000-0000-0000-0000000000b1";
const AVISO = "00000000-0000-0000-0000-00000000c001";
const ORDEN = "00000000-0000-0000-0000-00000000d001";

// 1 aviso × 7 días con la tarifa por defecto.
const COSTO = 16.14;

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const num = async (sql: string) => Number((await q<{ v: string }>(`select (${sql})::text as v`))[0].v);
const uno = async <T,>(sql: string): Promise<T> => (await q<T>(sql))[0];

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
      description text, listing_id uuid, order_id uuid, created_at timestamptz default now()
    );

    create function public.spend_credits(p_user_id uuid, p_credits numeric, p_listing_id uuid default null, p_description text default null)
      returns boolean language sql as $$ select true $$;

    -- ── Piezas del cobro que la 0096 da por existentes ──
    create type public.invoice_type as enum ('boleta', 'factura');
    create type public.doc_type as enum ('dni', 'ruc', 'ce');
    create type public.invoice_sunat_status as enum ('pendiente', 'emitido', 'omitido', 'vencido');

    create table public.orders (
      id uuid primary key, user_id uuid, listing_qty int, duration_days int,
      extras jsonb default '{}'::jsonb, subtotal numeric, igv numeric, total numeric,
      status text default 'pending', payment_provider text, payment_ref text,
      paid_at timestamptz, created_at timestamptz default now()
    );
    create sequence public.invoice_num_seq;
    create table public.invoices (
      id serial primary key, order_id uuid unique,
      number text default ('B001-' || lpad(nextval('public.invoice_num_seq')::text, 6, '0')),
      type public.invoice_type, email text, advertiser_name text,
      doc_type public.doc_type, doc_number text, factiliza_data jsonb,
      amount numeric, subtotal numeric, igv numeric, detail text,
      sunat_status public.invoice_sunat_status, sunat_next_try_at timestamptz,
      sunat_last_error text, email_status text default 'pendiente', email_next_try_at timestamptz
    );

    create function public.invoice_emission_enabled() returns boolean language sql stable as $$ select false $$;

    create function public.add_credits(p_user_id uuid, p_credits numeric, p_description text default null, p_order_id uuid default null)
    returns void language plpgsql security definer as $$
    begin
      insert into public.user_credits (user_id, balance, updated_at)
        values (p_user_id, p_credits, now())
      on conflict (user_id) do update
        set balance = user_credits.balance + excluded.balance, updated_at = now();
      insert into public.credit_transactions (user_id, type, credits, description, order_id)
        values (p_user_id, 'purchase', p_credits, p_description, p_order_id);
    end $$;

    grant select on public.pricing_settings, public.promotions to authenticated, anon;
    grant select, update on public.listings to authenticated;
    grant select, insert, update on public.user_credits to authenticated;
    grant select, insert on public.credit_transactions to authenticated;
    grant usage on sequence public.credit_transactions_id_seq to authenticated;
  `);
  await db.exec(MIG_0091);
  await db.exec(MIG_0096);

  const s = DEFAULT_SETTINGS;
  await db.exec(`
    insert into public.pricing_settings (base, desc_por_aviso, desc_cantidad, saltos, extras, is_active)
    values (${s.base}, ${s.descPorAviso}, '${JSON.stringify(s.descCantidad)}'::jsonb,
            '${JSON.stringify(s.saltos)}'::jsonb, '${JSON.stringify(s.extras)}'::jsonb, true);
  `);
});

beforeEach(async () => {
  await db.exec(`
    reset role; set test.uid = '';
    delete from public.invoices;
    delete from public.credit_transactions;
    delete from public.orders;
    delete from public.listings;
    insert into public.user_credits (user_id, balance, updated_at)
      values ('${YO}', 0, now()), ('${OTRO}', 0, now())
      on conflict (user_id) do update set balance = 0;
  `);
});

const borrador = (estado = "draft", owner = YO) => db.exec(`
  insert into public.listings (id, owner_id, category_id, status, plan_quantity, plan_duration_days, plan_extras)
  values ('${AVISO}', '${owner}', 'autos', '${estado}', 1, 7, '{}'::jsonb);
`);

// Orden pagada por el faltante, atada al aviso (lo que crea create-payment).
const ordenDePublicacion = (creditos: number, listing: string | null = AVISO) => db.exec(`
  insert into public.orders (id, user_id, listing_qty, duration_days, subtotal, igv, total, status, extras)
  values ('${ORDEN}', '${YO}', 1, 7, ${(creditos / 1.18).toFixed(2)}, ${(creditos - creditos / 1.18).toFixed(2)}, ${creditos}, 'pending',
    jsonb_build_object(
      'credits', ${creditos},
      'detail', 'Publicación de aviso: Casa bonita',
      ${listing ? `'purpose', 'publish', 'listing_id', '${listing}', 'duration_days', 7,` : ""}
      'receipt', jsonb_build_object('receiptType','boleta','email','a@b.com','advertiserName','JUAN','docType','dni','docNumber','44443333')
    ));
`);

const liquidar = () =>
  uno<{ r: Record<string, unknown> }>(`select public.settle_paid_order('${ORDEN}', 'tx-1') as r`);

const saldo = () => num(`select balance from public.user_credits where user_id = '${YO}'`);
const estado = () => uno<{ status: string }>(`select status from public.listings where id = '${AVISO}'`);

// ─────────────────────────────────────────────────────────────────────
describe("0096 · el pago publica el aviso", () => {
  it("acredita el faltante, cobra el costo entero y deja el aviso activo", async () => {
    await borrador();
    // Ya tenía 6 y paga los 10.14 que faltaban.
    await db.exec(`update public.user_credits set balance = 6 where user_id = '${YO}';`);
    await ordenDePublicacion(10.14);

    const { r } = await liquidar();
    expect(r.settled).toBe(true);
    expect(r.published).toBe(true);
    expect(r.listing_id).toBe(AVISO);

    // El aviso queda activo y con vigencia.
    expect((await estado()).status).toBe("active");
    expect(await num(
      `select count(*) from public.listings where id = '${AVISO}' and published_at is not null and expires_at > now()`,
    )).toBe(1);

    // 6 + 10.14 − 16.14 = 0. Y el historial guarda las dos patas.
    expect(await saldo()).toBe(0);
    expect(await num(`select credits from public.credit_transactions where type = 'purchase'`)).toBe(10.14);
    expect(await num(`select credits from public.credit_transactions where type = 'spend'`)).toBe(-COSTO);

    // Y el comprobante se emitió por lo que se cobró de verdad, no por el costo.
    expect(await num(`select amount from public.invoices where order_id = '${ORDEN}'`)).toBe(10.14);
  });

  it("si el aviso no se puede publicar, el cobro NO se pierde", async () => {
    // Un aviso que ya está activo: publish_listing lo rechaza.
    await borrador("active");
    await ordenDePublicacion(16.14);

    const { r } = await liquidar();

    // La liquidación sale adelante igual…
    expect(r.settled).toBe(true);
    expect(r.published).toBe(false);
    // …con el saldo acreditado y el comprobante emitido.
    expect(await saldo()).toBe(16.14);
    expect(await num(`select count(*) from public.invoices where order_id = '${ORDEN}'`)).toBe(1);
    expect(await num(`select count(*) from public.orders where id = '${ORDEN}' and status = 'paid'`)).toBe(1);

    // Y el motivo queda anotado para poder diagnosticarlo.
    const { err } = await uno<{ err: string | null }>(
      `select extras ->> 'publish_error' as err from public.orders where id = '${ORDEN}'`,
    );
    expect(err).toBeTruthy();
  });

  it("sin saldo suficiente para el costo, tampoco se pierde el pago", async () => {
    // Paga menos de lo que cuesta (tarifa cambiada entre crear la orden y pagar).
    await borrador();
    await ordenDePublicacion(5);

    const { r } = await liquidar();
    expect(r.published).toBe(false);
    // Ni publicado ni cobrado el aviso: el saldo se queda entero para reintentar.
    expect((await estado()).status).toBe("draft");
    expect(await saldo()).toBe(5);
    expect(await num(`select count(*) from public.credit_transactions where type = 'spend'`)).toBe(0);
  });

  it("una compra de saldo normal no toca ningún aviso", async () => {
    await borrador();
    await ordenDePublicacion(50, null); // sin purpose ni listing_id

    const { r } = await liquidar();
    expect(r.settled).toBe(true);
    expect(r.published).toBeNull();
    expect((await estado()).status).toBe("draft");
    expect(await saldo()).toBe(50);
  });

  it("es idempotente: el reintento de Izipay no publica ni acredita dos veces", async () => {
    await borrador();
    await ordenDePublicacion(16.14);

    await liquidar();
    const { r } = await liquidar(); // Izipay reintenta

    expect(r.settled).toBe(false);
    expect(await saldo()).toBe(0);           // 16.14 − 16.14, una sola vez
    expect(await num(`select count(*) from public.credit_transactions`)).toBe(2);
    expect(await num(`select count(*) from public.invoices`)).toBe(1);
  });
});

describe("0096 · permisos", () => {
  it("effe_publish_listing NO es invocable desde el navegador", async () => {
    for (const rol of ["authenticated", "anon", "public"]) {
      expect(
        await uno<{ p: boolean }>(
          `select has_function_privilege('${rol}', 'public.effe_publish_listing(uuid, int, uuid)', 'execute') as p`,
        ),
        `rol ${rol}`,
      ).toEqual({ p: false });
    }
    // La liquidación sí, que es quien la usa.
    expect(await uno<{ p: boolean }>(
      `select has_function_privilege('service_role', 'public.effe_publish_listing(uuid, int, uuid)', 'execute') as p`,
    )).toEqual({ p: true });
  });

  it("settle_paid_order sigue fuera del alcance del navegador", async () => {
    for (const rol of ["authenticated", "anon", "public"]) {
      expect(
        await uno<{ p: boolean }>(
          `select has_function_privilege('${rol}', 'public.settle_paid_order(uuid, text)', 'execute') as p`,
        ),
        `rol ${rol}`,
      ).toEqual({ p: false });
    }
  });

  it("publish_listing sigue publicando para su dueño, y solo para él", async () => {
    await borrador();
    await db.exec(`update public.user_credits set balance = 100 where user_id = '${YO}';`);

    // Otro usuario no puede publicarlo.
    await db.exec(`set role authenticated; set test.uid = '${OTRO}';`);
    await expect(db.exec(`select public.publish_listing('${AVISO}', 7);`)).rejects.toThrow(/sin permiso/i);

    // Su dueño sí, y se le cobra.
    await db.exec(`set role authenticated; set test.uid = '${YO}';`);
    await db.exec(`select public.publish_listing('${AVISO}', 7);`);
    await db.exec(`reset role; set test.uid = '';`);

    expect((await estado()).status).toBe("active");
    expect(await saldo()).toBe(100 - COSTO);
  });
});
