// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0061 (fichero REAL) contra un Postgres de verdad.
 *
 * settle_paid_order() es la única vía que acredita créditos y emite la boleta
 * tras un pago confirmado por Izipay. Lo que hay que garantizar:
 *   - liquida una orden 'pending' → status 'paid', boleta emitida, saldo sumado;
 *   - es IDEMPOTENTE: reintentar el IPN (segunda llamada) NO duplica créditos ni
 *     comprobantes (Izipay reintenta la notificación);
 *   - toma los datos del comprobante desde orders.extras (los deja create-payment);
 *   - el índice único bloquea a nivel de datos una segunda compra por orden.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0061_payment_settlement.sql"),
  "utf8",
);

let db: PGlite;

const USER = "11111111-1111-1111-1111-111111111111";

// Inserta una orden 'pending' con el payload de liquidación en extras.
const seedOrder = (id: string, credits: number, total: number) =>
  db.exec(`
    insert into public.orders (id, user_id, listing_qty, duration_days, extras, subtotal, igv, total, status)
    values (
      '${id}', '${USER}', 0, 0,
      '${JSON.stringify({
        credits,
        detail: `Compra de saldo: 1 aviso · 7 días`,
        receipt: {
          receiptType: "boleta",
          email: "juan@correo.com",
          advertiserName: "JUAN PEREZ",
          docType: "dni",
          docNumber: "44443333",
          factilizaData: { direccion: "AV. LIMA 123" },
        },
      })}'::jsonb,
      ${(total / 1.18).toFixed(2)}, ${(total - total / 1.18).toFixed(2)}, ${total}, 'pending'
    );
  `);

const settle = async (orderId: string, ref = "txn-abc") => {
  const { rows } = await db.query<{ settle_paid_order: { settled: boolean; invoice_number?: string; credits?: number } }>(
    `select public.settle_paid_order('${orderId}'::uuid, '${ref}') as settle_paid_order`,
  );
  return rows[0].settle_paid_order;
};

const balance = async () => {
  const { rows } = await db.query<{ balance: string }>(
    `select coalesce(balance, 0) as balance from public.user_credits where user_id = '${USER}'`,
  );
  return Number(rows[0]?.balance ?? 0);
};

const counts = async (orderId: string) => {
  const inv = await db.query<{ n: number }>(
    `select count(*)::int as n from public.invoices where order_id = '${orderId}'`,
  );
  const tx = await db.query<{ n: number }>(
    `select count(*)::int as n from public.credit_transactions where order_id = '${orderId}' and type = 'purchase'`,
  );
  return { invoices: inv.rows[0].n, purchases: tx.rows[0].n };
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create type public.order_status as enum ('pending','paid','failed','refunded');
    create type public.invoice_type as enum ('boleta','factura');
    create type public.doc_type     as enum ('dni','ruc','ce');

    create table public.profiles (id uuid primary key, full_name text);

    create table public.orders (
      id uuid primary key,
      user_id uuid not null references public.profiles (id) on delete cascade,
      listing_qty int not null default 1,
      duration_days int not null,
      extras jsonb not null default '{}'::jsonb,
      subtotal numeric(12,2) not null default 0,
      igv numeric(12,2) not null default 0,
      total numeric(12,2) not null default 0,
      status public.order_status not null default 'pending',
      payment_provider text,
      payment_ref text,
      created_at timestamptz not null default now()
    );

    create sequence if not exists public.invoice_number_seq;
    create table public.invoices (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null references public.orders (id) on delete cascade,
      number text not null unique,
      type public.invoice_type not null default 'boleta',
      email text,
      advertiser_name text,
      doc_number text,
      doc_type public.doc_type,
      factiliza_data jsonb,
      amount numeric(12,2) not null,
      detail text,
      issued_at timestamptz not null default now()
    );
    create or replace function public.set_invoice_number()
    returns trigger language plpgsql as $$
    begin
      if new.number is null or new.number = '' then
        new.number := 'B001-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
      end if;
      return new;
    end;
    $$;
    create trigger invoices_set_number
      before insert on public.invoices
      for each row execute function public.set_invoice_number();

    create table public.user_credits (
      user_id uuid primary key references public.profiles (id) on delete cascade,
      balance numeric(12,2) not null default 0 check (balance >= 0),
      updated_at timestamptz not null default now()
    );
    create table public.credit_transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id) on delete cascade,
      type text not null check (type in ('purchase','spend')),
      credits numeric(12,2) not null,
      description text,
      listing_id uuid,
      order_id uuid references public.orders (id) on delete set null,
      created_at timestamptz not null default now()
    );

    create or replace function public.add_credits(
      p_user_id uuid, p_credits numeric, p_description text default null, p_order_id uuid default null
    ) returns void language plpgsql security definer as $$
    begin
      insert into public.user_credits (user_id, balance, updated_at)
        values (p_user_id, p_credits, now())
      on conflict (user_id) do update
        set balance = user_credits.balance + excluded.balance, updated_at = now();
      insert into public.credit_transactions (user_id, type, credits, description, order_id)
        values (p_user_id, 'purchase', p_credits, p_description, p_order_id);
    end;
    $$;
    grant execute on function public.add_credits(uuid, numeric, text, uuid) to authenticated;

    insert into public.profiles (id, full_name) values ('${USER}', 'Juan Perez');
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec(`
    delete from public.credit_transactions;
    delete from public.invoices;
    delete from public.orders;
    delete from public.user_credits;
  `);
});

describe("0061 — settle_paid_order", () => {
  it("liquida una orden pendiente: paid + boleta + saldo acreditado", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000001";
    await seedOrder(id, 16.14, 16.14);

    const r = await settle(id, "txn-001");
    expect(r.settled).toBe(true);
    expect(r.invoice_number).toMatch(/^B001-\d{6}$/);
    expect(Number(r.credits)).toBe(16.14);

    const { rows } = await db.query<{ status: string; payment_provider: string; payment_ref: string; paid_at: string }>(
      `select status::text, payment_provider, payment_ref, paid_at from public.orders where id = '${id}'`,
    );
    expect(rows[0].status).toBe("paid");
    expect(rows[0].payment_provider).toBe("izipay");
    expect(rows[0].payment_ref).toBe("txn-001");
    expect(rows[0].paid_at).not.toBeNull();

    expect(await balance()).toBe(16.14);
    expect(await counts(id)).toEqual({ invoices: 1, purchases: 1 });
  });

  it("es idempotente: reintentar el IPN no duplica créditos ni comprobantes", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000002";
    await seedOrder(id, 50, 50);

    const first = await settle(id, "txn-002");
    const second = await settle(id, "txn-002"); // Izipay reintenta la notificación

    expect(first.settled).toBe(true);
    expect(second.settled).toBe(false); // el gate corta la segunda liquidación

    expect(await balance()).toBe(50); // NO 100
    expect(await counts(id)).toEqual({ invoices: 1, purchases: 1 });
  });

  it("emite la boleta con los datos de Factiliza guardados en extras", async () => {
    const id = "aaaaaaaa-0000-0000-0000-000000000003";
    await seedOrder(id, 20, 20);
    await settle(id);

    const { rows } = await db.query<{
      type: string; email: string; advertiser_name: string; doc_type: string; doc_number: string; factiliza_data: Record<string, unknown>;
    }>(`select type::text, email, advertiser_name, doc_type::text, doc_number, factiliza_data
        from public.invoices where order_id = '${id}'`);
    expect(rows[0]).toMatchObject({
      type: "boleta",
      email: "juan@correo.com",
      advertiser_name: "JUAN PEREZ",
      doc_type: "dni",
      doc_number: "44443333",
    });
    expect(rows[0].factiliza_data).toEqual({ direccion: "AV. LIMA 123" });
  });

  it("una orden inexistente devuelve settled:false sin tocar nada", async () => {
    const r = await settle("aaaaaaaa-0000-0000-0000-0000000000ff");
    expect(r.settled).toBe(false);
    expect(await balance()).toBe(0);
  });

  it("es re-ejecutable: correr la migración dos veces no falla", async () => {
    await db.exec(MIGRATION);
    const id = "aaaaaaaa-0000-0000-0000-000000000004";
    await seedOrder(id, 10, 10);
    expect((await settle(id)).settled).toBe(true);
  });
});
