// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre las migraciones 0082 y 0083 (ficheros REALES) contra un Postgres de
 * verdad, sobre el mismo mini-esquema que usa migration0061.test.ts.
 *
 * Lo que hay que garantizar:
 *   - la regla de oro: si el aviso al worker falla, los créditos se acreditan
 *     IGUAL. El usuario ya pagó;
 *   - sigue siendo idempotente frente al reintento del IPN de Izipay;
 *   - un solo worker puede enviar a la vez, y uno con la reserva caducada no
 *     puede pisar el resultado del que le relevó;
 *   - un comprobante fuera del plazo de SUNAT no se envía nunca;
 *   - la fecha de emisión se congela en el primer intento.
 */

const leer = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/", f), "utf8");

const M0082 = leer("0082_invoice_series.sql");
const M0083 = leer("0083_invoice_emission.sql");

let db: PGlite;

const USER = "11111111-1111-1111-1111-111111111111";
const ORDER = (n: number) => `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`;

/**
 * Monta el esquema previo y aplica 0082 + 0083.
 * `dispatchRompe`: simula que pg_net revienta, para probar la regla de oro.
 */
async function montar(opts: { emisionActiva?: boolean; dispatchRompe?: boolean } = {}) {
  db = new PGlite();
  await db.exec(`
    create schema if not exists net;
    create role anon;
    create role authenticated;
    create role service_role;

    create type public.order_status as enum ('pending','paid','failed','refunded');
    create type public.invoice_type as enum ('boleta','factura');
    create type public.doc_type     as enum ('dni','ruc','ce');

    create table public.profiles (id uuid primary key, full_name text);
    insert into public.profiles (id, full_name) values ('${USER}', 'Juan Pérez');

    create table public.orders (
      id uuid primary key,
      user_id uuid not null references public.profiles (id) on delete cascade,
      extras jsonb not null default '{}'::jsonb,
      subtotal numeric(12,2) not null default 0,
      igv numeric(12,2) not null default 0,
      total numeric(12,2) not null default 0,
      status public.order_status not null default 'pending',
      payment_provider text, payment_ref text,
      paid_at timestamptz,
      created_at timestamptz not null default now()
    );

    create sequence if not exists public.invoice_number_seq;
    create table public.invoices (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null references public.orders (id) on delete cascade,
      number text not null unique,
      type public.invoice_type not null default 'boleta',
      email text, advertiser_name text, doc_number text,
      doc_type public.doc_type, factiliza_data jsonb,
      amount numeric(12,2) not null, detail text,
      issued_at timestamptz not null default now()
    );
    alter table public.invoices enable row level security;
    create or replace function public.set_invoice_number()
    returns trigger language plpgsql as $$
    begin
      if new.number is null or new.number = '' then
        new.number := 'B001-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
      end if;
      return new;
    end; $$;
    create trigger invoices_set_number before insert on public.invoices
      for each row execute function public.set_invoice_number();

    create table public.user_credits (
      user_id uuid primary key, balance numeric(12,2) not null default 0,
      updated_at timestamptz not null default now()
    );
    create table public.credit_transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, type text not null, credits numeric(12,2) not null,
      description text, order_id uuid, created_at timestamptz not null default now()
    );
    create unique index credit_tx_order_purchase_uidx
      on public.credit_transactions (order_id) where type = 'purchase' and order_id is not null;

    create or replace function public.add_credits(
      p_user_id uuid, p_credits numeric, p_detail text, p_order_id uuid)
    returns void language plpgsql as $$
    begin
      insert into public.user_credits (user_id, balance) values (p_user_id, p_credits)
        on conflict (user_id) do update set balance = public.user_credits.balance + p_credits;
      insert into public.credit_transactions (user_id, type, credits, description, order_id)
        values (p_user_id, 'purchase', p_credits, p_detail, p_order_id);
    end; $$;

    create table public.system_settings (
      key text primary key, value jsonb not null default '{}'::jsonb,
      label text, updated_at timestamptz not null default now()
    );
    create or replace function public.has_perm(p_module text, p_action text)
    returns boolean language sql stable as $$ select true $$;

    -- Sustituto de pg_net. Registra las llamadas para poder comprobarlas.
    create table public.net_calls (id serial primary key, url text, body jsonb);
    create or replace function net.http_post(url text, body jsonb, headers jsonb)
    returns bigint language plpgsql as $$
    begin
      ${opts.dispatchRompe
        ? `raise exception 'pg_net no disponible';`
        : `insert into public.net_calls (url, body) values (url, body);`}
      return 1;
    end; $$;
  `);

  await db.exec(M0082);
  await db.exec(M0083);

  if (opts.emisionActiva) {
    await db.exec(
      `update public.system_settings set value = 'true'::jsonb where key = 'invoice_emission_enabled';`,
    );
  }
}

const seedOrder = (n: number, credits = 10, total = 118) =>
  db.exec(`
    insert into public.orders (id, user_id, extras, subtotal, igv, total, status)
    values ('${ORDER(n)}', '${USER}',
      '${JSON.stringify({
        credits,
        detail: "Compra de saldo: 1 aviso · 7 días",
        receipt: {
          receiptType: "boleta", email: "juan@correo.com",
          advertiserName: "JUAN PEREZ", docType: "dni", docNumber: "44443333",
          factilizaData: { direccion: "AV. LIMA 123" },
        },
      })}'::jsonb,
      ${(total / 1.18).toFixed(2)}, ${(total - total / 1.18).toFixed(2)}, ${total}, 'pending');
  `);

const settle = async (n: number, ref = "txn-abc") => {
  const { rows } = await db.query<{ r: { settled: boolean; invoice_number?: string } }>(
    `select public.settle_paid_order('${ORDER(n)}'::uuid, '${ref}') as r`,
  );
  return rows[0].r;
};

const balance = async () => {
  const { rows } = await db.query<{ balance: string }>(
    `select coalesce(balance,0) as balance from public.user_credits where user_id = '${USER}'`,
  );
  return Number(rows[0]?.balance ?? 0);
};

const invoice = async (n: number) => {
  const { rows } = await db.query<Record<string, unknown>>(
    `select * from public.invoices where order_id = '${ORDER(n)}'`,
  );
  return rows[0];
};

const claim = async (id: string, lease = 300) => {
  const { rows } = await db.query<Record<string, unknown>>(
    `select * from public.claim_invoice_emission('${id}'::uuid, ${lease})`,
  );
  return rows[0];
};

describe("0083 — la emisión nunca bloquea el pago", () => {
  it("si el aviso al worker revienta, los créditos se acreditan igual", async () => {
    // Esta es la prueba central del diseño: pg_net caído no puede costarle al
    // usuario el saldo que ya pagó.
    await montar({ emisionActiva: true, dispatchRompe: true });
    await seedOrder(1);

    const r = await settle(1);

    expect(r.settled).toBe(true);
    expect(await balance()).toBe(10);
    const { rows } = await db.query<{ status: string }>(
      `select status from public.orders where id = '${ORDER(1)}'`,
    );
    expect(rows[0].status).toBe("paid");
    expect((await invoice(1)).number).toBe("B001-000001");
  });

  it("en condiciones normales sí avisa al worker", async () => {
    await montar({ emisionActiva: true });
    await seedOrder(1);
    await settle(1);

    const { rows } = await db.query<{ url: string }>(`select url from public.net_calls`);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toContain("/functions/v1/emit-invoice");
  });
});

describe("0083 — liquidación", () => {
  beforeEach(async () => {
    await montar({ emisionActiva: true });
    await seedOrder(1);
  });

  it("guarda el desglose de subtotal e IGV que exige SUNAT", async () => {
    await settle(1);
    const inv = await invoice(1);
    expect(Number(inv.amount)).toBe(118);
    expect(Number(inv.subtotal)).toBeCloseTo(100, 2);
    expect(Number(inv.igv)).toBeCloseTo(18, 2);
    expect(Number(inv.subtotal) + Number(inv.igv)).toBeCloseTo(Number(inv.amount), 2);
  });

  it("sigue siendo idempotente: el reintento del pago no duplica nada", async () => {
    const primera = await settle(1);
    const segunda = await settle(1);

    expect(primera.settled).toBe(true);
    expect(segunda.settled).toBe(false);
    expect(await balance()).toBe(10);
    const { rows } = await db.query<{ n: string }>(
      `select count(*)::text as n from public.invoices where order_id = '${ORDER(1)}'`,
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("el comprobante nace en cola de envío", async () => {
    await settle(1);
    const inv = await invoice(1);
    expect(inv.sunat_status).toBe("pendiente");
    expect(inv.email_status).toBe("pendiente");
  });
});

describe("0083 — con la emisión apagada", () => {
  it("el comprobante es interno, dice por qué, y los créditos entran igual", async () => {
    await montar({ emisionActiva: false });
    await seedOrder(1);
    await settle(1);

    const inv = await invoice(1);
    expect(inv.sunat_status).toBe("omitido");
    expect(String(inv.sunat_last_error)).toMatch(/no configurada/i);
    // Pero el correo sí sale: el comprobante interno se envía igual.
    expect(inv.email_status).toBe("pendiente");
    expect(await balance()).toBe(10);
  });
});

describe("0083 — un solo envío a la vez", () => {
  let id: string;

  beforeEach(async () => {
    await montar({ emisionActiva: true });
    await seedOrder(1);
    await settle(1);
    id = String((await invoice(1)).id);
  });

  it("el segundo worker no obtiene nada mientras el primero tiene la reserva", async () => {
    expect(await claim(id)).toBeTruthy();
    expect(await claim(id)).toBeUndefined();
  });

  it("cuando la reserva caduca, otro worker puede relevarlo", async () => {
    await claim(id);
    await db.exec(
      `update public.invoices set sunat_claimed_at = now() - interval '10 minutes' where id = '${id}'`,
    );
    const segundo = await claim(id);
    expect(segundo).toBeTruthy();
    expect(Number(segundo.o_attempts)).toBe(2);
  });

  it("un worker con la reserva caducada no puede pisar el resultado bueno", async () => {
    const viejo = await claim(id);
    await db.exec(
      `update public.invoices set sunat_claimed_at = now() - interval '10 minutes' where id = '${id}'`,
    );
    const nuevo = await claim(id);

    // El relevo acepta el comprobante…
    await db.query(
      `select public.finish_invoice_emission('${id}'::uuid, '${nuevo.o_claim_id}'::uuid,
              'aceptado', 'hash-ok', null, null, null, null, false)`,
    );
    // …y el zombi intenta marcarlo como rechazado: no debe poder.
    const { rows } = await db.query<{ ok: boolean }>(
      `select public.finish_invoice_emission('${id}'::uuid, '${viejo.o_claim_id}'::uuid,
              'rechazado', null, null, null, '3027', 'error viejo', false) as ok`,
    );

    expect(rows[0].ok).toBe(false);
    const inv = await invoice(1);
    expect(inv.sunat_status).toBe("aceptado");
    expect(inv.sunat_hash).toBe("hash-ok");
  });

  it("la fecha de emisión se congela en el primer intento", async () => {
    const primero = await claim(id);
    await db.exec(
      `update public.invoices set sunat_claimed_at = now() - interval '10 minutes' where id = '${id}'`,
    );
    const segundo = await claim(id);
    expect(String(segundo.o_fecha_emision)).toBe(String(primero.o_fecha_emision));
  });
});

describe("0083 — reintentos y plazo", () => {
  let id: string;

  beforeEach(async () => {
    await montar({ emisionActiva: true });
    await seedOrder(1);
    await settle(1);
    id = String((await invoice(1)).id);
  });

  it("tras un error espera antes de reintentar, y no se reclama hasta que toca", async () => {
    const c = await claim(id);
    await db.query(
      `select public.finish_invoice_emission('${id}'::uuid, '${c.o_claim_id}'::uuid,
              'error', null, null, null, null, 'sin conexión', false)`,
    );
    const inv = await invoice(1);
    expect(inv.sunat_status).toBe("error");
    expect(inv.sunat_next_try_at).toBeTruthy();
    // Aún no toca: no se puede reclamar.
    expect(await claim(id)).toBeUndefined();
  });

  it("un rechazo no se reintenta solo: los datos están mal", async () => {
    const c = await claim(id);
    await db.query(
      `select public.finish_invoice_emission('${id}'::uuid, '${c.o_claim_id}'::uuid,
              'rechazado', null, null, null, '3027', 'catálogo inválido', false)`,
    );
    const inv = await invoice(1);
    expect(inv.sunat_status).toBe("rechazado");
    expect(inv.sunat_next_try_at).toBeNull();
    expect(await claim(id)).toBeUndefined();
  });

  it("tras insistir mucho se da por vencido", async () => {
    await db.exec(`update public.invoices set sunat_attempts = 8 where id = '${id}'`);
    await db.exec(`update public.invoices set sunat_status = 'error', sunat_next_try_at = now() where id = '${id}'`);
    const c = await claim(id);
    await db.query(
      `select public.finish_invoice_emission('${id}'::uuid, '${c.o_claim_id}'::uuid,
              'error', null, null, null, null, 'otra vez', false)`,
    );
    expect((await invoice(1)).sunat_status).toBe("vencido");
  });

  it("fuera del plazo de SUNAT ya no se envía", async () => {
    // Un comprobante que se quedó sin emitir hace una semana no puede mandarse
    // con su fecha vieja ni re-fecharse: lo arregla contabilidad.
    await db.exec(`update public.invoices set issued_at = now() - interval '7 days' where id = '${id}'`);
    expect(await claim(id)).toBeUndefined();
  });
});

describe("0083 — reintento desde el panel", () => {
  it("devuelve el comprobante a la cola y vuelve a avisar al worker", async () => {
    await montar({ emisionActiva: true });
    await seedOrder(1);
    await settle(1);
    const id = String((await invoice(1)).id);

    const c = await claim(id);
    await db.query(
      `select public.finish_invoice_emission('${id}'::uuid, '${c.o_claim_id}'::uuid,
              'rechazado', null, null, null, '3027', 'datos mal', false)`,
    );
    await db.exec(`delete from public.net_calls`);

    await db.query(`select public.retry_invoice_emission('${id}'::uuid)`);

    expect((await invoice(1)).sunat_status).toBe("pendiente");
    const { rows } = await db.query<{ n: string }>(`select count(*)::text as n from public.net_calls`);
    expect(Number(rows[0].n)).toBe(1);
  });

  it("sin permiso, no se puede reintentar", async () => {
    await montar({ emisionActiva: true });
    await db.exec(
      `create or replace function public.has_perm(p_module text, p_action text)
       returns boolean language sql stable as $$ select false $$;`,
    );
    await seedOrder(1);
    await settle(1);
    const id = String((await invoice(1)).id);

    await expect(db.query(`select public.retry_invoice_emission('${id}'::uuid)`)).rejects.toThrow(
      /no autorizado/i,
    );
  });
});
