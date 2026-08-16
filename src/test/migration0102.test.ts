// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0102 — que el comprador se entere de que le anularon la compra.
 *
 * Antes de esto, anular retiraba el saldo en silencio: el usuario veía bajar su
 * balance sin explicación y se quedaba con la boleta original en el correo, ya
 * sin valor. Lo que se garantiza aquí:
 *
 *  1. Que el aviso in-app sale SIEMPRE, haya nota de crédito o no, porque el
 *     saldo se retira en los dos casos.
 *  2. Que un fallo del aviso jamás tumba la anulación (que ya movió dinero).
 *  3. Que el correo con la nota de crédito solo se manda cuando SUNAT la dio
 *     por buena — al revés que el del comprobante, que sale pase lo que pase.
 *  4. Que las columnas nuevas NO despiertan a los comprobantes normales: su
 *     valor por defecto es 'pendiente' y el barrido tiene que ignorarlos.
 *  5. Que la reserva del correo es exclusiva y sus reintentos se agotan.
 */

const leer = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/", f), "utf8");

const MIGS = ["0082_invoice_series.sql", "0083_invoice_emission.sql",
  "0098_emision_de_pruebas.sql", "0099_modo_de_la_aplicacion.sql",
  "0100_reintentos_que_aguantan.sql", "0101_anular_comprobante.sql",
  "0102_aviso_de_anulacion.sql"].map(leer);

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const uno = async <T,>(sql: string): Promise<T> => (await q<T>(sql))[0];

const USER = "11111111-1111-1111-1111-111111111111";
const ORDER = "22222222-2222-2222-2222-222222222222";

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

    -- Notificaciones: copia fiel de la 0014 (tablas + notify_user). Se reproduce
    -- en vez de cargar la migración entera porque aquella arrastra media
    -- aplicación en disparadores (mensajes, postulaciones, reseñas).
    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      type text not null, channel text not null default 'in_app', title text,
      payload jsonb not null default '{}'::jsonb,
      read_at timestamptz, created_at timestamptz not null default now()
    );
    create table public.notification_preferences (
      user_id uuid not null, event_type text not null,
      in_app boolean not null default true, push boolean not null default false,
      email boolean not null default false,
      primary key (user_id, event_type)
    );
    create or replace function public.notify_user(
      p_user uuid, p_event text, p_title text, p_payload jsonb)
    returns void language plpgsql as $$
    declare v_in_app boolean; v_push boolean; v_email boolean;
    begin
      if p_user is null then return; end if;
      select in_app, push, email into v_in_app, v_push, v_email
        from public.notification_preferences
       where user_id = p_user and event_type = p_event;
      if coalesce(v_in_app, true) then
        insert into public.notifications (user_id, type, channel, title, payload)
        values (p_user, p_event, 'in_app', p_title, p_payload);
      end if;
      if coalesce(v_push, false) then
        insert into public.notifications (user_id, type, channel, title, payload)
        values (p_user, p_event, 'push', p_title, p_payload);
      end if;
      if coalesce(v_email, false) then
        insert into public.notifications (user_id, type, channel, title, payload)
        values (p_user, p_event, 'email', p_title, p_payload);
      end if;
    end; $$;
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

const anular = async (motivo = "Cobro duplicado", forzar = false) =>
  uno<{ r: Record<string, unknown> }>(
    `select public.anular_comprobante('${await facturaId()}', '${motivo}', ${forzar}) as r`,
  ).then((x) => x.r);

interface Aviso {
  type: string; channel: string; title: string | null;
  payload: Record<string, unknown>;
}
const avisos = () =>
  q<Aviso>(`select type, channel, title, payload from public.notifications
             where user_id = '${USER}' order by created_at`);

/** Deja la nota emitida y aceptada por SUNAT, que es cuando toca el correo. */
async function aceptarLaNota(estado = "aceptado") {
  const id = await facturaId();
  const c = await uno<{ o_claim_id: string }>(
    `select o_claim_id::text as o_claim_id from public.claim_invoice_note('${id}')`);
  await db.exec(
    `select public.finish_invoice_note('${id}', '${c.o_claim_id}', '${estado}',
            'hash-nota', null, null, null, false);`);
  return id;
}

interface CorreoNota {
  o_id: string; o_claim_id: string; o_number: string; o_nota_number: string;
  o_nota_serie: string; o_nota_correlativo: string; o_email: string;
  o_advertiser_name: string; o_motivo: string; o_credits_devueltos: string;
  o_attempts: number; o_es_prueba: boolean;
}
const reclamarCorreo = async () =>
  q<CorreoNota>(`select * from public.claim_invoice_note_email('${await facturaId()}')`);

const estadoCorreo = () =>
  uno<{ st: string; next: string | null; sent: string | null; n: number; err: string | null }>(
    `select nota_email_status as st, nota_email_next_try_at::text as next,
            nota_email_sent_at::text as sent, nota_email_attempts as n,
            nota_email_last_error as err
       from public.invoices where order_id = '${ORDER}'`);

beforeEach(() => montar());

// ─────────────────────────────────────────────────────────────────────────────
describe("0102 · el aviso al comprador", () => {
  it("anular deja un aviso in-app con el motivo y lo que se retiró", async () => {
    await compra({ declarado: true });
    await anular("Cobro duplicado");

    const a = await avisos();
    expect(a).toHaveLength(1);
    expect(a[0].type).toBe("invoice_voided");
    expect(a[0].channel).toBe("in_app");
    expect(a[0].payload.number).toBe("B066-000001");
    expect(a[0].payload.reason).toBe("Cobro duplicado");
    expect(Number(a[0].payload.credits)).toBe(100);
    // Con nota de crédito, el aviso la nombra.
    expect(String(a[0].payload.note)).toMatch(/^BC/);
  });

  it("también avisa cuando el comprobante era interno y no hubo nota", async () => {
    await compra();   // sin declarar: no se emite nota
    const r = await anular("Prueba interna");

    expect(r.emite_nota).toBe(false);
    const a = await avisos();
    expect(a).toHaveLength(1);
    expect(a[0].payload.note).toBeNull();
    expect(Number(a[0].payload.credits)).toBe(100);
  });

  it("dice cuánto quedó sin recuperar si el usuario ya gastó parte", async () => {
    await compra();
    await db.exec(`update public.user_credits set balance = 30 where user_id = '${USER}'`);
    await anular("Devolución parcial", true);

    const a = await avisos();
    expect(Number(a[0].payload.credits)).toBe(30);
    expect(Number(a[0].payload.sin_recuperar)).toBe(70);
  });

  it("un fallo del aviso NO tumba la anulación", async () => {
    await compra();
    // El aviso es lo último y lo menos importante: la anulación ya movió saldo.
    await db.exec(`
      create or replace function public.notify_user(
        p_user uuid, p_event text, p_title text, p_payload jsonb)
      returns void language plpgsql as $$ begin raise exception 'sin cola'; end; $$;`);

    const r = await anular();
    expect(r.anulado).toBe(true);
    expect(await saldo()).toBe(0);
    expect(await avisos()).toHaveLength(0);
  });

  it("respeta las preferencias del usuario", async () => {
    await db.exec(`insert into public.notification_preferences (user_id, event_type, in_app)
                   values ('${USER}', 'invoice_voided', false)`);
    await compra();
    await anular();
    expect(await avisos()).toHaveLength(0);
  });

  it("no avisa dos veces si se intenta anular lo ya anulado", async () => {
    await compra();
    await anular();
    const segunda = await anular();
    expect(segunda.anulado).toBe(false);
    expect(await avisos()).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("0102 · el correo con la nota de crédito", () => {
  it("no se reclama mientras SUNAT no haya aceptado la nota", async () => {
    await compra({ declarado: true });
    await anular();
    // La nota existe pero está 'pendiente' de envío.
    expect(await reclamarCorreo()).toHaveLength(0);
  });

  it("aceptar la nota pone su correo en cola y la reserva lo entrega", async () => {
    await compra({ declarado: true });
    await anular("Cobro duplicado");
    await aceptarLaNota();

    expect((await estadoCorreo()).next).not.toBeNull();

    const [c] = await reclamarCorreo();
    expect(c.o_number).toBe("B066-000001");
    expect(c.o_nota_number).toMatch(/^BC/);
    expect(c.o_motivo).toBe("Cobro duplicado");
    expect(c.o_email).toBe("a@b.com");
    expect(Number(c.o_credits_devueltos)).toBe(100);
    expect(c.o_attempts).toBe(1);
  });

  it("una nota RECHAZADA no se le manda a nadie", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota("rechazado");
    expect(await reclamarCorreo()).toHaveLength(0);
  });

  it("la reserva es exclusiva: dos workers no mandan el mismo correo", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();

    expect(await reclamarCorreo()).toHaveLength(1);
    expect(await reclamarCorreo()).toHaveLength(0);
  });

  it("recupera la reserva de un worker que se murió a medias", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    await reclamarCorreo();

    await db.exec(`update public.invoices
                      set nota_email_claimed_at = now() - interval '10 minutes'
                    where order_id = '${ORDER}'`);
    expect(await reclamarCorreo()).toHaveLength(1);
  });

  it("sin correo del comprador no hay nada que reclamar", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    await db.exec(`update public.invoices set email = null where order_id = '${ORDER}'`);
    expect(await reclamarCorreo()).toHaveLength(0);
  });

  it("enviado queda enviado y no se repite", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    const [c] = await reclamarCorreo();

    await db.exec(`select public.finish_invoice_note_email(
      '${c.o_id}', '${c.o_claim_id}', 'enviado', 're_123', null)`);

    const e = await estadoCorreo();
    expect(e.st).toBe("enviado");
    expect(e.sent).not.toBeNull();
    expect(e.next).toBeNull();
    expect(await reclamarCorreo()).toHaveLength(0);
  });

  it("un error programa el reintento y guarda el motivo", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    const [c] = await reclamarCorreo();

    await db.exec(`select public.finish_invoice_note_email(
      '${c.o_id}', '${c.o_claim_id}', 'error', null, 'Resend respondió 500')`);

    const e = await estadoCorreo();
    expect(e.st).toBe("error");
    expect(e.err).toBe("Resend respondió 500");
    expect(e.next).not.toBeNull();
    // Todavía no toca: hay espera.
    expect(await reclamarCorreo()).toHaveLength(0);

    await db.exec(`update public.invoices set nota_email_next_try_at = now() - interval '1 minute'
                    where order_id = '${ORDER}'`);
    expect(await reclamarCorreo()).toHaveLength(1);
  });

  it("los reintentos se agotan: no se insiste para siempre", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    await db.exec(`update public.invoices set nota_email_attempts = 5 where order_id = '${ORDER}'`);
    const [c] = await reclamarCorreo();

    await db.exec(`select public.finish_invoice_note_email(
      '${c.o_id}', '${c.o_claim_id}', 'error', null, 'se acabó')`);

    const e = await estadoCorreo();
    expect(e.n).toBe(6);
    expect(e.next).toBeNull();
  });

  it("una reserva ajena no puede cerrar el envío", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    await reclamarCorreo();

    const ok = await uno<{ ok: boolean }>(`select public.finish_invoice_note_email(
      '${await facturaId()}', gen_random_uuid(), 'enviado', 'x', null) as ok`);
    expect(ok.ok).toBe(false);
    expect((await estadoCorreo()).st).toBe("enviando");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("0102 · el barrido", () => {
  it("NO despierta a un comprobante normal por las columnas nuevas", async () => {
    // Es el riesgo de que nota_email_status nazca en 'pendiente' para todos.
    await compra();
    await db.exec(`update public.invoices
                      set sunat_status = 'omitido', email_status = 'enviado'
                    where order_id = '${ORDER}'`);

    const n = await uno<{ n: number }>(`select public.sweep_invoice_emissions(20) as n`);
    expect(Number(n.n)).toBe(0);
  });

  it("recoge el correo de una nota ya aceptada", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    await db.exec(`update public.invoices set email_status = 'enviado' where order_id = '${ORDER}'`);

    const n = await uno<{ n: number }>(`select public.sweep_invoice_emissions(20) as n`);
    expect(Number(n.n)).toBe(1);
  });

  it("recoge una reserva de correo abandonada", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    await reclamarCorreo();
    await db.exec(`update public.invoices
                      set email_status = 'enviado',
                          nota_email_claimed_at = now() - interval '10 minutes'
                    where order_id = '${ORDER}'`);

    const n = await uno<{ n: number }>(`select public.sweep_invoice_emissions(20) as n`);
    expect(Number(n.n)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("0102 · el botón de reintentar del panel", () => {
  it("no ensucia un comprobante que nadie anuló", async () => {
    await compra();
    await db.exec(`select public.retry_invoice_emission('${await facturaId()}')`);

    const r = await uno<{ st: string | null; next: string | null; enext: string | null }>(
      `select nota_sunat_status::text as st, nota_next_try_at::text as next,
              nota_email_next_try_at::text as enext
         from public.invoices where order_id = '${ORDER}'`);
    expect(r.st).toBeNull();
    expect(r.next).toBeNull();
    expect(r.enext).toBeNull();
  });

  it("destraba el correo de una nota que se quedó en error", async () => {
    await compra({ declarado: true });
    await anular();
    await aceptarLaNota();
    const [c] = await reclamarCorreo();
    await db.exec(`select public.finish_invoice_note_email(
      '${c.o_id}', '${c.o_claim_id}', 'error', null, 'Resend respondió 500')`);

    await db.exec(`select public.retry_invoice_emission('${await facturaId()}')`);

    const e = await estadoCorreo();
    expect(e.st).toBe("pendiente");
    expect(e.next).not.toBeNull();
    expect(await reclamarCorreo()).toHaveLength(1);
  });

  it("sin permiso no reintenta nada", async () => {
    await montar({ permiso: false });
    await compra();
    await expect(
      db.exec(`select public.retry_invoice_emission('${await facturaId()}')`),
    ).rejects.toThrow(/no autorizado/i);
  });
});
