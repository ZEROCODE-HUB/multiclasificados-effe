// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0110 + 0111 — comprar siendo extranjero.
 *
 * Un extranjero no tiene DNI, así que hasta ahora no se le podía emitir
 * comprobante y por tanto no podía comprar. Con el pasaporte en el enum y el
 * país en la boleta, sí. Lo que se prueba:
 *
 *  1. Que 'pasaporte' es un tipo de documento válido en la base.
 *  2. Que liquidar un pago guarda el documento y el PAÍS que vinieron en la
 *     orden, sin inventarse un "PE".
 *  3. Que una compra peruana normal sigue exactamente igual (país PE por
 *     defecto), que es lo que no puede romperse.
 *  4. Que `settle_paid_order`, al recrearse entera, no se queda sin sus
 *     permisos: sigue siendo solo del servidor.
 */
const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0091 = read("0091_precio_en_el_servidor.sql");
const MIG_0096 = read("0096_pagar_y_publicar.sql");
const MIG_0110 = read("0110_tipo_de_documento_pasaporte.sql");
const MIG_0111 = read("0111_comprobante_para_extranjeros.sql");

const YO = "00000000-0000-0000-0000-0000000000a1";
const ORDEN = "00000000-0000-0000-0000-00000000d001";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
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
  `);
  await db.exec(MIG_0091);
  await db.exec(MIG_0096);
  // El enum va en su propio archivo: Postgres no deja usar un valor nuevo en la
  // misma transacción en la que se añade.
  await db.exec(MIG_0110);
  await db.exec(MIG_0111);

  await db.exec(`
    insert into public.pricing_settings (base, desc_por_aviso, desc_cantidad, saltos, extras, is_active)
    values (16.14, 0.5, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, true);
  `);
});

beforeEach(() => db.exec(`
  delete from public.invoices;
  delete from public.credit_transactions;
  delete from public.orders;
  insert into public.user_credits (user_id, balance, updated_at) values ('${YO}', 0, now())
    on conflict (user_id) do update set balance = 0;
`));

// Orden de compra de saldo con los datos del comprobante que arma create-payment.
const orden = (receipt: Record<string, string>) => db.exec(`
  insert into public.orders (id, user_id, listing_qty, duration_days, subtotal, igv, total, status, extras)
  values ('${ORDEN}', '${YO}', 1, 7, 100, 18, 118, 'pending',
    jsonb_build_object(
      'credits', 118,
      'detail', 'Compra de saldo',
      'receipt', '${JSON.stringify(receipt)}'::jsonb
    ));
`);

const liquidar = () => db.exec(`select public.settle_paid_order('${ORDEN}', 'tx-1');`);

describe("0110 · el pasaporte entra en el catálogo", () => {
  it("'pasaporte' es un valor válido de doc_type", async () => {
    const r = await uno<{ ok: boolean }>(`select 'pasaporte'::public.doc_type is not null as ok`);
    expect(r.ok).toBe(true);
  });

  it("los tipos de siempre siguen ahí", async () => {
    const filas = await q<{ v: string }>(`
      select unnest(enum_range(null::public.doc_type))::text as v order by 1`);
    expect(filas.map((f) => f.v).sort()).toEqual(["ce", "dni", "pasaporte", "ruc"]);
  });
});

describe("0111 · el comprobante guarda el país", () => {
  it("una compra con pasaporte se emite con su documento y su país", async () => {
    await orden({
      receiptType: "boleta", email: "john@correo.com", advertiserName: "JOHN SMITH",
      docType: "pasaporte", docNumber: "AB123456", country: "US",
    });
    await liquidar();

    const inv = await uno<{ doc_type: string; doc_number: string; pais: string; advertiser_name: string }>(
      `select doc_type::text, doc_number, pais, advertiser_name from public.invoices where order_id = '${ORDEN}'`);
    expect(inv.doc_type).toBe("pasaporte");
    expect(inv.doc_number).toBe("AB123456");
    expect(inv.pais).toBe("US");
    expect(inv.advertiser_name).toBe("JOHN SMITH");
  });

  it("el país se guarda en mayúsculas, venga como venga", async () => {
    await orden({
      receiptType: "boleta", email: "a@b.com", advertiserName: "MARIA",
      docType: "ce", docNumber: "001234567", country: "cl",
    });
    await liquidar();
    const inv = await uno<{ pais: string }>(`select pais from public.invoices where order_id = '${ORDEN}'`);
    expect(inv.pais).toBe("CL");
  });

  it("una compra peruana de siempre no cambia: país PE por defecto", async () => {
    // Las órdenes creadas ANTES de este cambio no traen `country`, y tienen que
    // seguir emitiéndose igual.
    await orden({
      receiptType: "boleta", email: "juan@correo.com", advertiserName: "JUAN PEREZ",
      docType: "dni", docNumber: "44443333",
    });
    await liquidar();
    const inv = await uno<{ pais: string; doc_type: string }>(
      `select pais, doc_type::text from public.invoices where order_id = '${ORDEN}'`);
    expect(inv.pais).toBe("PE");
    expect(inv.doc_type).toBe("dni");
  });

  it("sigue acreditando el saldo (recrear la función no puede romper el cobro)", async () => {
    await orden({
      receiptType: "boleta", email: "a@b.com", advertiserName: "JOHN", docType: "pasaporte",
      docNumber: "AB123456", country: "US",
    });
    await liquidar();
    const s = await uno<{ b: string }>(`select balance::text as b from public.user_credits where user_id = '${YO}'`);
    expect(Number(s.b)).toBe(118);
  });

  it("sigue siendo idempotente: liquidar dos veces no acredita el doble", async () => {
    await orden({
      receiptType: "boleta", email: "a@b.com", advertiserName: "JOHN", docType: "pasaporte",
      docNumber: "AB123456", country: "US",
    });
    await liquidar();
    const r = await uno<{ r: Record<string, unknown> }>(`select public.settle_paid_order('${ORDEN}', 'tx-1') as r`);
    expect(r.r.settled).toBe(false);
    const s = await uno<{ b: string }>(`select balance::text as b from public.user_credits where user_id = '${YO}'`);
    expect(Number(s.b)).toBe(118);
  });

  it("recrearla no le devolvió los permisos a nadie: sigue siendo del servidor", async () => {
    for (const rol of ["anon", "authenticated"]) {
      const r = await uno<{ ok: boolean }>(
        `select has_function_privilege('${rol}', 'public.settle_paid_order(uuid, text)', 'execute') as ok`);
      expect(r.ok).toBe(false);
    }
    const s = await uno<{ ok: boolean }>(
      `select has_function_privilege('service_role', 'public.settle_paid_order(uuid, text)', 'execute') as ok`);
    expect(s.ok).toBe(true);
  });

  it("es re-ejecutable", async () => {
    await expect(db.exec(MIG_0111)).resolves.toBeDefined();
  });
});
