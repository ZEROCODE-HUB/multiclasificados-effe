// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0113 — renovar un aviso sin dejarlo caer.
 *
 * Lo que se prueba, que es donde está el dinero y la justicia del cambio:
 *  1. Los días se SUMAN a lo que quedaba (renovar antes de tiempo no castiga).
 *  2. `published_at` no se mueve: renovar no es una forma barata de reencabezar
 *     el buscador.
 *  3. Cobra lo mismo que publicar (mismo motor de precios).
 *  4. Sin saldo no pasa nada: ni se renueva ni se cobra.
 *  5. Un tercero no puede renovar el aviso de otro, ni desde el navegador
 *     llamar a la versión con actor libre.
 */
const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0091 = read("0091_precio_en_el_servidor.sql");
const MIG_0096 = read("0096_pagar_y_publicar.sql");
const MIG_0110 = read("0110_tipo_de_documento_pasaporte.sql");
const MIG_0111 = read("0111_comprobante_para_extranjeros.sql");
const MIG_0113 = read("0113_renovar_el_aviso.sql");

const YO = "00000000-0000-0000-0000-0000000000a1";
const OTRO = "00000000-0000-0000-0000-0000000000b1";
const AVISO = "00000000-0000-0000-0000-00000000c001";
const ORDEN = "00000000-0000-0000-0000-00000000d001";
const COSTO = 16.14; // 1 aviso × 7 días con la tarifa por defecto

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const uno = async <T,>(sql: string): Promise<T> => (await q<T>(sql))[0];
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
      id uuid primary key, owner_id uuid, category_id text, status text, title text,
      published_at timestamptz, expires_at timestamptz, expiry_notified_at timestamptz,
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

    -- notify_user: aquí solo hace falta que exista y anote a quién avisó.
    create table public.avisos_enviados (user_id uuid, tipo text, payload jsonb);
    create function public.notify_user(a uuid, b text, c text, d jsonb) returns void
      language sql as $$ insert into public.avisos_enviados values (a, b, d) $$;
  `);
  await db.exec(MIG_0091);
  await db.exec(MIG_0096);
  await db.exec(MIG_0110);
  await db.exec(MIG_0111);
  await db.exec(MIG_0113);

  await db.exec(`
    insert into public.pricing_settings (base, desc_por_aviso, desc_cantidad, saltos, extras, is_active)
    values (16.14, 0.5, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, true);
  `);
});

beforeEach(() => db.exec(`
  reset role; set test.uid = '';
  delete from public.avisos_enviados;
  delete from public.invoices; delete from public.credit_transactions;
  delete from public.orders; delete from public.listings;
  insert into public.user_credits (user_id, balance, updated_at)
    values ('${YO}', 0, now()), ('${OTRO}', 0, now())
    on conflict (user_id) do update set balance = 0;
`));

// Aviso activo al que le quedan `dias` de vigencia.
const activo = (dias: number, owner = YO, estado = "active") => db.exec(`
  insert into public.listings (id, owner_id, category_id, status, title, plan_quantity, plan_duration_days, plan_extras, published_at, expires_at)
  values ('${AVISO}', '${owner}', 'autos', '${estado}', 'Casa bonita', 1, 7, '{}'::jsonb,
          now() - interval '20 days', now() + interval '${dias} days');
`);

const conSaldo = (n: number, quien = YO) =>
  db.exec(`update public.user_credits set balance = ${n} where user_id = '${quien}';`);

const renovar = (dias = 7, actor = YO) =>
  db.exec(`select public.effe_renovar_aviso('${AVISO}', ${dias}, '${actor}');`);

describe("0113 · renovar suma días en vez de reiniciar", () => {
  it("los días se añaden a los que quedaban", async () => {
    await activo(4);
    await conSaldo(100);
    await renovar(7);
    // 4 que le quedaban + 7 comprados = 11 (se comprueba con un día de holgura).
    const dias = await num(`select extract(day from (expires_at - now())) from public.listings where id = '${AVISO}'`);
    expect(dias).toBeGreaterThanOrEqual(10);
    expect(dias).toBeLessThanOrEqual(11);
  });

  it("un aviso vencido hace tiempo arranca desde HOY, no desde su vencimiento", async () => {
    await db.exec(`
      insert into public.listings (id, owner_id, category_id, status, title, plan_quantity, plan_duration_days, plan_extras, published_at, expires_at)
      values ('${AVISO}', '${YO}', 'autos', 'expired', 'Vieja', 1, 7, '{}'::jsonb,
              now() - interval '60 days', now() - interval '30 days');`);
    await conSaldo(100);
    await renovar(7);
    const dias = await num(`select extract(day from (expires_at - now())) from public.listings where id = '${AVISO}'`);
    expect(dias).toBeGreaterThanOrEqual(6);
    expect(dias).toBeLessThanOrEqual(7);
    expect((await uno<{ status: string }>(`select status from public.listings where id = '${AVISO}'`)).status).toBe("active");
  });

  it("no mueve published_at: renovar no reencabeza el buscador", async () => {
    await activo(4);
    await conSaldo(100);
    const antes = await uno<{ p: string }>(`select published_at::text as p from public.listings where id = '${AVISO}'`);
    await renovar(7);
    const despues = await uno<{ p: string }>(`select published_at::text as p from public.listings where id = '${AVISO}'`);
    expect(despues.p).toBe(antes.p);
  });

  it("cobra lo mismo que publicar y lo anota como gasto", async () => {
    await activo(4);
    await conSaldo(100);
    await renovar(7);
    expect(await num(`select balance from public.user_credits where user_id = '${YO}'`)).toBeCloseTo(100 - COSTO, 2);
    const t = await uno<{ description: string; credits: string }>(
      `select description, credits::text as credits from public.credit_transactions order by id desc limit 1`);
    expect(t.description).toBe("Renovación de aviso");
    expect(Number(t.credits)).toBeCloseTo(-COSTO, 2);
  });

  it("sin saldo no renueva NI cobra: el aviso queda como estaba", async () => {
    await activo(4);
    await conSaldo(1);
    await expect(renovar(7)).rejects.toThrow(/Saldo insuficiente/);
    expect(await num(`select balance from public.user_credits where user_id = '${YO}'`)).toBe(1);
    const dias = await num(`select extract(day from (expires_at - now())) from public.listings where id = '${AVISO}'`);
    expect(dias).toBeLessThanOrEqual(4);
  });

  it("un tercero no puede renovar el aviso de otro (ni cobrárselo)", async () => {
    await activo(4);
    await conSaldo(100);
    await expect(renovar(7, OTRO)).rejects.toThrow(/sin permiso|no encontrado/i);
    expect(await num(`select balance from public.user_credits where user_id = '${YO}'`)).toBe(100);
  });

  it("un borrador no se renueva: eso es publicar", async () => {
    await activo(4, YO, "draft");
    await conSaldo(100);
    await expect(renovar(7)).rejects.toThrow(/no encontrado|no renovable/i);
  });

  it("una duración inventada se rechaza", async () => {
    await activo(4);
    await conSaldo(100);
    await expect(renovar(45)).rejects.toThrow(/Duración inválida/);
  });

  it("deja el aviso listo para volver a avisar de su vencimiento", async () => {
    await activo(4);
    await db.exec(`update public.listings set expiry_notified_at = now(), expiry_notified_3d_at = now() where id = '${AVISO}';`);
    await conSaldo(100);
    await renovar(7);
    const r = await uno<{ a: string | null; b: string | null }>(
      `select expiry_notified_at::text as a, expiry_notified_3d_at::text as b from public.listings where id = '${AVISO}'`);
    expect(r.a).toBeNull();
    expect(r.b).toBeNull();
  });
});

describe("0113 · pagar y renovar", () => {
  it("liquidar una orden con purpose 'renew' renueva el aviso", async () => {
    await activo(2);
    await db.exec(`
      insert into public.orders (id, user_id, listing_qty, duration_days, subtotal, igv, total, status, extras)
      values ('${ORDEN}', '${YO}', 1, 7, 13.68, 2.46, 16.14, 'pending',
        jsonb_build_object('credits', 16.14, 'detail', 'Renovación',
          'purpose', 'renew', 'listing_id', '${AVISO}', 'duration_days', 7,
          'receipt', jsonb_build_object('receiptType','boleta','email','a@b.com','advertiserName','JUAN','docType','dni','docNumber','44443333')));`);

    const r = await uno<{ r: Record<string, unknown> }>(`select public.settle_paid_order('${ORDEN}', 'tx-1') as r`);
    expect(r.r.settled).toBe(true);
    expect(r.r.published).toBe(true);

    // 2 días que le quedaban + 7 comprados.
    const dias = await num(`select extract(day from (expires_at - now())) from public.listings where id = '${AVISO}'`);
    expect(dias).toBeGreaterThanOrEqual(8);
    // Y el saldo queda a cero: entró lo pagado y salió el costo.
    expect(await num(`select balance from public.user_credits where user_id = '${YO}'`)).toBeCloseTo(0, 2);
  });

  it("publicar sigue funcionando igual (no se rompió al añadir 'renew')", async () => {
    await activo(0, YO, "draft");
    await db.exec(`
      insert into public.orders (id, user_id, listing_qty, duration_days, subtotal, igv, total, status, extras)
      values ('${ORDEN}', '${YO}', 1, 7, 13.68, 2.46, 16.14, 'pending',
        jsonb_build_object('credits', 16.14, 'detail', 'Publicación',
          'purpose', 'publish', 'listing_id', '${AVISO}', 'duration_days', 7,
          'receipt', jsonb_build_object('receiptType','boleta','email','a@b.com','advertiserName','JUAN','docType','dni','docNumber','44443333')));`);
    const r = await uno<{ r: Record<string, unknown> }>(`select public.settle_paid_order('${ORDEN}', 'tx-1') as r`);
    expect(r.r.published).toBe(true);
    expect((await uno<{ status: string }>(`select status from public.listings where id = '${AVISO}'`)).status).toBe("active");
  });
});

describe("0113 · el aviso de vencimiento llega con tres días", () => {
  it("avisa de los que vencen dentro de 3 días, una sola vez", async () => {
    await activo(2);
    expect(await num(`select public.notify_expiring_listings()`)).toBe(1);
    const [a] = await q<{ payload: Record<string, unknown> }>(`select payload from public.avisos_enviados`);
    expect(a.payload.listing_id).toBe(AVISO);
    expect(Number(a.payload.dias)).toBeGreaterThanOrEqual(1);
    // Segunda pasada: ya está avisado, no se repite.
    expect(await num(`select public.notify_expiring_listings()`)).toBe(0);
  });

  it("uno que vence dentro de un mes todavía no molesta a nadie", async () => {
    await activo(30);
    expect(await num(`select public.notify_expiring_listings()`)).toBe(0);
  });
});

describe("0113 · permisos", () => {
  it("la versión con actor libre no la puede llamar el navegador", async () => {
    for (const rol of ["anon", "authenticated"]) {
      const r = await uno<{ ok: boolean }>(
        `select has_function_privilege('${rol}', 'public.effe_renovar_aviso(uuid, int, uuid)', 'execute') as ok`);
      expect(r.ok).toBe(false);
    }
  });

  it("el envoltorio sí, porque el actor lo pone la sesión", async () => {
    const r = await uno<{ ok: boolean }>(
      `select has_function_privilege('authenticated', 'public.renovar_aviso(uuid, int)', 'execute') as ok`);
    expect(r.ok).toBe(true);
  });

  it("es re-ejecutable", async () => {
    await expect(db.exec(MIG_0113)).resolves.toBeDefined();
  });
});
