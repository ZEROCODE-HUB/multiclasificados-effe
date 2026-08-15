// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0101 — anular una compra desde el panel.
 *
 * Esto retira saldo de usuarios reales y emite un documento fiscal, así que se
 * prueba con el mismo cuidado que la liquidación. Lo que se garantiza:
 *
 *  1. Que el saldo se retira BIEN: ni de más, ni dejando el balance negativo.
 *  2. Que si el usuario ya gastó lo comprado, la anulación NO ocurre en
 *     silencio: se niega y hay que confirmarla a sabiendas. Fue la decisión
 *     explícita del encargo — que el admin sepa lo que está haciendo.
 *  3. Que solo se manda nota de crédito de lo que llegó a declararse. Un
 *     comprobante interno no tiene nada que anular ante SUNAT.
 *  4. Que no se puede anular dos veces ni sin permiso.
 *  5. Que una orden devuelta no se vuelve a liquidar con un IPN tardío.
 */

const leer = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/", f), "utf8");

const MIGS = ["0082_invoice_series.sql", "0083_invoice_emission.sql",
  "0098_emision_de_pruebas.sql", "0099_modo_de_la_aplicacion.sql",
  "0100_reintentos_que_aguantan.sql", "0101_anular_comprobante.sql"].map(leer);

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const uno = async <T,>(sql: string): Promise<T> => (await q<T>(sql))[0];

const USER = "11111111-1111-1111-1111-111111111111";
const ORDER = "22222222-2222-2222-2222-222222222222";

/** `permiso` decide qué contesta has_perm: así se prueba el guard. */
async function montar(opts: { permiso?: boolean } = {}) {
  db = new PGlite();
  await db.exec(`
    create schema if not exists net;
    create role anon; create role authenticated; create role service_role;
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as $$
      select '${USER}'::uuid $$;

    create type public.order_status as enum ('pending','paid','failed','refunded');
    create type public.invoice_type as enum ('boleta','factura');
    create type public.doc_type     as enum ('dni','ruc','ce');

    create table public.profiles (id uuid primary key, full_name text);
    insert into public.profiles (id, full_name) values ('${USER}', 'Juan Pérez');

    create table public.audit_logs (
      id serial primary key, actor_id uuid, action text, entity text,
      entity_id text, meta jsonb, created_at timestamptz default now()
    );

    create table public.orders (
      id uuid primary key, user_id uuid not null references public.profiles(id),
      extras jsonb not null default '{}'::jsonb,
      subtotal numeric(12,2) default 0, igv numeric(12,2) default 0,
      total numeric(12,2) default 0, status public.order_status default 'pending',
      payment_provider text, payment_ref text, paid_at timestamptz,
      created_at timestamptz default now()
    );

    create sequence if not exists public.invoice_number_seq;
    create table public.invoices (
      id uuid primary key default gen_random_uuid(),
      order_id uuid not null references public.orders(id) on delete cascade,
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
      user_id uuid primary key, balance numeric(12,2) not null default 0
        check (balance >= 0),
      updated_at timestamptz not null default now()
    );
    create table public.credit_transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, type text not null check (type in ('purchase','spend')),
      credits numeric(12,2) not null, description text, order_id uuid,
      created_at timestamptz not null default now()
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

    -- Lo que suma como "gastado" por el usuario. Una devolución NO puede contar.
    create or replace function public.get_credits_spent(p_user_id uuid)
    returns numeric language sql stable as $$
      select coalesce(sum(abs(credits)), 0) from public.credit_transactions
       where user_id = p_user_id and type = 'spend' $$;

    create table public.system_settings (
      key text primary key, value jsonb not null default '{}'::jsonb,
      label text, updated_at timestamptz not null default now()
    );
    create or replace function public.has_perm(p_module text, p_action text)
    returns boolean language sql stable as $$ select ${opts.permiso === false ? "false" : "true"} $$;

    create or replace function public.effe_publish_listing(p_listing uuid, p_dias int, p_user uuid)
    returns void language sql as $$ select null::void $$;

    create table public.net_calls (id serial primary key, url text, body jsonb);
    create or replace function net.http_post(url text, body jsonb, headers jsonb)
    returns bigint language plpgsql as $$
    begin insert into public.net_calls (url, body) values (url, body); return 1; end; $$;
  `);
  for (const m of MIGS) await db.exec(m);
}

/** Compra liquidada: deja la orden pagada, el comprobante y el saldo. */
async function compra(opts: { declarado?: boolean; creditos?: number } = {}) {
  const cr = opts.creditos ?? 100;
  await db.exec(`
    insert into public.orders (id, user_id, extras, subtotal, igv, total, status)
    values ('${ORDER}', '${USER}',
      jsonb_build_object('credits', ${cr}, 'detail', 'Compra de saldo',
        'receipt', jsonb_build_object('receiptType','boleta','email','a@b.com',
          'advertiserName','JUAN','docType','dni','docNumber','44443333')),
      ${(cr / 1.18).toFixed(2)}, ${(cr - cr / 1.18).toFixed(2)}, ${cr}, 'pending');
    select public.settle_paid_order('${ORDER}', 'izi-1');
  `);
  if (opts.declarado) {
    await db.exec(`update public.invoices set sunat_status = 'aceptado' where order_id = '${ORDER}';`);
  }
}

const facturaId = () =>
  uno<{ id: string }>(`select id::text as id from public.invoices where order_id = '${ORDER}'`)
    .then((r) => r.id);

const saldo = () =>
  uno<{ b: string }>(`select coalesce(balance,0)::text as b from public.user_credits where user_id = '${USER}'`)
    .then((r) => Number(r.b));

const comprobante = () =>
  uno<{ number: string; anulado_at: string | null; nota_number: string | null;
        nota_sunat_status: string | null; credits_devueltos: string | null; anulado_motivo: string | null }>(
    `select number, anulado_at::text, nota_number, nota_sunat_status::text,
            credits_devueltos::text, anulado_motivo
       from public.invoices where order_id = '${ORDER}'`);

const anular = async (motivo = "Cobro duplicado", forzar = false) =>
  uno<{ r: Record<string, unknown> }>(
    `select public.anular_comprobante('${await facturaId()}', '${motivo}', ${forzar}) as r`,
  ).then((x) => x.r);

beforeEach(() => montar());

describe("0101 · anular un comprobante DECLARADO", () => {
  it("emite nota de crédito, retira el saldo y devuelve la orden", async () => {
    await compra({ declarado: true });
    expect(await saldo()).toBe(100);

    const r = await anular("Cliente pidió devolución");

    expect(r.anulado).toBe(true);
    expect(r.emite_nota).toBe(true);
    expect(await saldo()).toBe(0);

    const c = await comprobante();
    expect(c.anulado_at).toBeTruthy();
    expect(c.anulado_motivo).toBe("Cliente pidió devolución");
    expect(Number(c.credits_devueltos)).toBe(100);
    // Serie propia de la nota, distinta de la del comprobante.
    expect(c.nota_number).toBe("BC66-000001");
    expect(c.nota_sunat_status).toBe("pendiente");

    const o = await uno<{ status: string }>(`select status::text from public.orders where id = '${ORDER}'`);
    expect(o.status).toBe("refunded");
  });

  it("el movimiento es 'refund' y NO cuenta como gasto del usuario", async () => {
    // Si se guardara como 'spend', las estadísticas dirían que el usuario gastó
    // un dinero que en realidad se le devolvió.
    await compra({ declarado: true });
    await anular();

    const t = await uno<{ type: string; credits: string }>(
      `select type, credits::text from public.credit_transactions where type = 'refund'`);
    expect(t.type).toBe("refund");
    expect(Number(t.credits)).toBe(-100);

    const gastado = await uno<{ g: string }>(`select public.get_credits_spent('${USER}')::text as g`);
    expect(Number(gastado.g)).toBe(0);
  });

  it("avisa al worker para que mande la nota", async () => {
    await compra({ declarado: true });
    await anular();
    expect(await q(`select 1 from public.net_calls`)).not.toHaveLength(0);
  });

  it("queda registrado quién anuló y por qué", async () => {
    await compra({ declarado: true });
    await anular("Error del operador");
    const log = await uno<{ action: string; meta: Record<string, unknown> }>(
      `select action, meta from public.audit_logs where action = 'void_invoice'`);
    expect(log.action).toBe("void_invoice");
    expect(log.meta.motivo).toBe("Error del operador");
    expect(Number(log.meta.creditos_retirados)).toBe(100);
  });
});

describe("0101 · anular un comprobante INTERNO", () => {
  it("devuelve el saldo pero NO emite nota: no hay nada declarado que anular", async () => {
    await compra();   // se queda en 'omitido'
    const r = await anular();

    expect(r.anulado).toBe(true);
    expect(r.emite_nota).toBe(false);
    expect(r.nota).toBeNull();
    expect(await saldo()).toBe(0);

    const c = await comprobante();
    expect(c.anulado_at).toBeTruthy();
    expect(c.nota_number).toBeNull();
  });

  it("no gasta correlativo de la serie de notas", async () => {
    await compra();
    await anular();
    const s = await uno<{ n: string }>(
      `select correlativo_nota_pruebas::text as n from public.invoice_series where id = 'boleta'`);
    expect(Number(s.n)).toBe(0);
  });
});

describe("0101 · 🔴 cuando el usuario ya gastó el saldo", () => {
  const gastar = (cuanto: number) => db.exec(`
    update public.user_credits set balance = balance - ${cuanto} where user_id = '${USER}';
    insert into public.credit_transactions (user_id, type, credits, description)
      values ('${USER}', 'spend', -${cuanto}, 'Publicación');`);

  it("se NIEGA a anular en silencio: hay que confirmarlo a sabiendas", async () => {
    // La decisión del encargo: que el admin sepa lo que está haciendo. Anular
    // sin avisar dejaría al usuario con saldo que ya no le corresponde, o
    // reventaría contra el CHECK de balance >= 0.
    await compra({ declarado: true });
    await gastar(60);                       // le quedan 40 de los 100

    await expect(anular("Devolución")).rejects.toThrow(/ya gastó parte del saldo/i);

    // Y no ha tocado nada.
    expect(await saldo()).toBe(40);
    expect((await comprobante()).anulado_at).toBeNull();
  });

  it("confirmado, retira lo que hay y deja constancia de lo que no se recupera", async () => {
    await compra({ declarado: true });
    await gastar(60);

    const r = await anular("Devolución", true);

    expect(r.anulado).toBe(true);
    expect(Number(r.creditos_retirados)).toBe(40);
    expect(Number(r.sin_recuperar)).toBe(60);
    expect(await saldo()).toBe(0);          // nunca negativo
  });

  it("con saldo a cero, anula sin retirar nada", async () => {
    await compra({ declarado: true });
    await gastar(100);
    const r = await anular("Devolución", true);
    expect(Number(r.creditos_retirados)).toBe(0);
    expect(Number(r.sin_recuperar)).toBe(100);
    expect(await saldo()).toBe(0);
  });
});

describe("0101 · la previsualización dice la verdad ANTES de anular", () => {
  it("cuando el saldo alcanza", async () => {
    await compra({ declarado: true });
    const p = await uno<{ r: Record<string, unknown> }>(
      `select public.previsualizar_anulacion('${await facturaId()}') as r`);
    expect(p.r.saldo_suficiente).toBe(true);
    expect(Number(p.r.se_retirara)).toBe(100);
    expect(Number(p.r.sin_recuperar)).toBe(0);
    expect(p.r.emitira_nota).toBe(true);
    expect(p.r.ya_anulado).toBe(false);
  });

  it("cuando NO alcanza, dice cuánto falta", async () => {
    await compra({ declarado: true });
    await db.exec(`update public.user_credits set balance = 30 where user_id = '${USER}';`);
    const p = await uno<{ r: Record<string, unknown> }>(
      `select public.previsualizar_anulacion('${await facturaId()}') as r`);
    expect(p.r.saldo_suficiente).toBe(false);
    expect(Number(p.r.se_retirara)).toBe(30);
    expect(Number(p.r.sin_recuperar)).toBe(70);
  });

  it("de un comprobante interno avisa de que no habrá nota", async () => {
    await compra();
    const p = await uno<{ r: Record<string, unknown> }>(
      `select public.previsualizar_anulacion('${await facturaId()}') as r`);
    expect(p.r.emitira_nota).toBe(false);
    expect(p.r.declarado).toBe(false);
  });

  it("no cambia nada: es solo una consulta", async () => {
    await compra({ declarado: true });
    await uno(`select public.previsualizar_anulacion('${await facturaId()}') as r`);
    expect(await saldo()).toBe(100);
    expect((await comprobante()).anulado_at).toBeNull();
  });
});

describe("0101 · lo que no se puede hacer", () => {
  it("anular dos veces", async () => {
    await compra({ declarado: true });
    expect((await anular()).anulado).toBe(true);

    const segunda = await anular();
    expect(segunda.anulado).toBe(false);
    expect(String(segunda.motivo)).toMatch(/ya estaba anulado/i);
    // Y el saldo no se retira dos veces.
    expect(await saldo()).toBe(0);
  });

  it("anular sin permiso", async () => {
    await montar({ permiso: false });
    await compra({ declarado: true });
    await expect(anular()).rejects.toThrow(/Sin permiso/i);
    await expect(uno(`select public.previsualizar_anulacion('${await facturaId()}')`))
      .rejects.toThrow(/Sin permiso/i);
  });

  it("anular sin dar un motivo", async () => {
    await compra({ declarado: true });
    await expect(anular("   ")).rejects.toThrow(/motivo/i);
  });

  it("🔴 volver a liquidar una orden ya devuelta", async () => {
    // Un IPN tardío de Izipay sobre una compra anulada la habría liquidado otra
    // vez: saldo acreditado de nuevo y un segundo comprobante.
    await compra({ declarado: true });
    await anular();

    const r = await uno<{ r: Record<string, unknown> }>(
      `select public.settle_paid_order('${ORDER}', 'ipn-tardio') as r`);
    expect(r.r.settled).toBe(false);
    expect(await saldo()).toBe(0);
    expect(await q(`select 1 from public.invoices where order_id = '${ORDER}'`)).toHaveLength(1);
  });
});

describe("0101 · sigue siendo seguro y repetible", () => {
  it("las funciones nuevas no quedan al alcance del navegador sin guard", async () => {
    const filas = await q<{ proname: string; acl: string | null }>(`
      select p.proname, array_to_string(p.proacl, ',') as acl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('next_credit_note_number','claim_invoice_note','finish_invoice_note')`);
    expect(filas.length).toBe(3);
    for (const f of filas) {
      expect(f.acl ?? "", f.proname).not.toMatch(/\bauthenticated=/);
      expect(f.acl ?? "", f.proname).not.toMatch(/\banon=/);
    }
  });

  it("aplicarla dos veces no rompe nada", async () => {
    await db.exec(MIGS[MIGS.length - 1]);
    await compra({ declarado: true });
    expect((await anular()).anulado).toBe(true);
  });

  it("el barrido recoge las notas pendientes", async () => {
    await compra({ declarado: true });
    await anular();
    await db.exec(`delete from public.net_calls;`);
    await db.exec(`select public.sweep_invoice_emissions(20);`);
    expect(await q(`select 1 from public.net_calls`)).not.toHaveLength(0);
  });
});
