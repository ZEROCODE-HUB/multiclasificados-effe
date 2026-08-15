// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0098 — emisión de pruebas sin dañar a los clientes reales.
 *
 * El riesgo que esta migración existe para evitar: la app está viva y hay
 * compras de verdad todos los días. Encender la emisión apuntando al entorno de
 * pruebas de Factiliza "para todo el mundo" haría que un cliente real recibiera
 * un documento SIN VALOR FISCAL, con un RUC que no es el nuestro, por una compra
 * que sí fue real.
 *
 * Por eso se prueba, sobre los ficheros SQL REALES:
 *
 *  1. Que una compra REAL no se emite mientras el interruptor `live` esté
 *     apagado, aunque el maestro esté encendido. Es la garantía que protege a
 *     los clientes y la que no puede romperse nunca.
 *  2. Que una compra de PRUEBA sí se emite, y con SU PROPIA SERIE — un
 *     correlativo saltado de la serie real hay que justificarlo ante SUNAT.
 *  3. Que hacer pruebas NO mueve el contador de la serie real.
 *  4. Que el correo sale aunque SUNAT rechace: el comprador ya pagó y tiene
 *     derecho a su comprobante. Antes se quedaba sin él para siempre.
 *  5. Que un comprobante fuera de plazo se marca y sale a revisión, en vez de
 *     quedarse mudo en 'pendiente' como pasaba.
 */

const leer = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/", f), "utf8");

const M0082 = leer("0082_invoice_series.sql");
const M0083 = leer("0083_invoice_emission.sql");
const M0098 = leer("0098_emision_de_pruebas.sql");

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const uno = async <T,>(sql: string): Promise<T> => (await q<T>(sql))[0];

const USER = "11111111-1111-1111-1111-111111111111";
const ORDER = (n: number) => `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`;

async function montar() {
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

    -- Publicar un aviso no es lo que se prueba aquí; basta con que exista.
    create or replace function public.effe_publish_listing(p_listing uuid, p_dias int, p_user uuid)
    returns void language sql as $$ select null::void $$;

    create table public.net_calls (id serial primary key, url text, body jsonb);
    create or replace function net.http_post(url text, body jsonb, headers jsonb)
    returns bigint language plpgsql as $$
    begin
      insert into public.net_calls (url, body) values (url, body);
      return 1;
    end; $$;
  `);

  await db.exec(M0082);
  await db.exec(M0083);
  await db.exec(M0098);
}

/** Crea una orden pendiente. `simulado` la marca como compra de prueba. */
const orden = (n: number, opts: { simulado?: boolean; tipo?: "boleta" | "factura" } = {}) =>
  db.exec(`
    insert into public.orders (id, user_id, extras, subtotal, igv, total, status, payment_provider)
    values ('${ORDER(n)}', '${USER}',
      jsonb_build_object('credits', 10, 'detail', 'Compra de saldo',
        'receipt', jsonb_build_object('receiptType', '${opts.tipo ?? "boleta"}',
          'email', 'a@b.com', 'advertiserName', 'JUAN', 'docType', 'dni', 'docNumber', '44443333')),
      100, 18, 118, 'pending', ${opts.simulado ? "'simulado'" : "'izipay'"});
  `);

const liquidar = (n: number, ref: string) =>
  uno<{ settle_paid_order: Record<string, unknown> }>(
    `select public.settle_paid_order('${ORDER(n)}', '${ref}') as settle_paid_order`,
  ).then((r) => r.settle_paid_order);

const encender = (clave: string) =>
  db.exec(`update public.system_settings set value = 'true'::jsonb where key = '${clave}';`);

const comprobante = (n: number) =>
  uno<{ number: string; serie: string; correlativo: string; es_prueba: boolean; sunat_status: string }>(
    `select number, serie, correlativo::text, es_prueba, sunat_status::text
       from public.invoices where order_id = '${ORDER(n)}'`,
  );

beforeEach(montar);

describe("0098 · a los clientes reales no les toca un comprobante de prueba", () => {
  it("con el maestro encendido pero 'live' apagado, una compra REAL no se emite", async () => {
    await encender("invoice_emission_enabled");
    await orden(1);
    await liquidar(1, "izi-abc");

    const c = await comprobante(1);
    // Sigue siendo el comprobante interno de siempre: numerado y enviado por
    // correo, pero sin declarar. Exactamente como antes de esta migración.
    expect(c.sunat_status).toBe("omitido");
    expect(c.es_prueba).toBe(false);
    expect(c.serie).toBe("B001");
  });

  it("con los DOS interruptores encendidos, una compra real sí se declara", async () => {
    await encender("invoice_emission_enabled");
    await encender("invoice_emission_live");
    await orden(2);
    await liquidar(2, "izi-def");

    const c = await comprobante(2);
    expect(c.sunat_status).toBe("pendiente");
    expect(c.es_prueba).toBe(false);
    expect(c.serie).toBe("B001");
  });

  it("sin el maestro no se emite nada, ni siquiera una compra de prueba", async () => {
    await orden(3, { simulado: true });
    await liquidar(3, "SIMULADO");
    expect((await comprobante(3)).sunat_status).toBe("omitido");
  });
});

describe("0098 · las pruebas van por su propia serie", () => {
  it("una compra simulada se emite y usa la serie de pruebas", async () => {
    await encender("invoice_emission_enabled");
    await orden(4, { simulado: true });
    await liquidar(4, "SIMULADO");

    const c = await comprobante(4);
    expect(c.es_prueba).toBe(true);
    expect(c.sunat_status).toBe("pendiente");
    expect(c.serie).toBe("B066");
    expect(c.number).toBe("B066-000001");
  });

  it("la factura de prueba usa F066", async () => {
    await encender("invoice_emission_enabled");
    await orden(5, { simulado: true, tipo: "factura" });
    await liquidar(5, "SIMULADO");
    expect((await comprobante(5)).serie).toBe("F066");
  });

  it("hacer pruebas NO mueve el contador de la serie real", async () => {
    await encender("invoice_emission_enabled");
    const antes = await uno<{ correlativo: string }>(
      `select correlativo::text from public.invoice_series where id = 'boleta'`,
    );

    await orden(6, { simulado: true });
    await liquidar(6, "SIMULADO");
    await orden(7, { simulado: true });
    await liquidar(7, "SIMULADO");

    const despues = await uno<{ correlativo: string; correlativo_pruebas: string }>(
      `select correlativo::text, correlativo_pruebas::text from public.invoice_series where id = 'boleta'`,
    );
    // Un correlativo saltado en la serie real hay que justificarlo ante SUNAT.
    expect(despues.correlativo).toBe(antes.correlativo);
    expect(Number(despues.correlativo_pruebas)).toBe(2);
  });

  it("marcar como prueba también funciona por payment_ref, no solo por proveedor", async () => {
    await encender("invoice_emission_enabled");
    await orden(8); // proveedor 'izipay'
    await liquidar(8, "SIMULADO");
    expect((await comprobante(8)).es_prueba).toBe(true);
  });
});

describe("0098 · el comprobante llega al comprador pase lo que pase", () => {
  const conEstado = async (estado: string) => {
    await encender("invoice_emission_enabled");
    await encender("invoice_emission_live");
    await orden(9);
    await liquidar(9, "izi-xyz");
    await db.exec(`
      update public.invoices set sunat_status = '${estado}', email_status = 'pendiente',
             email_next_try_at = now()
       where order_id = '${ORDER(9)}';`);
    return q(`select * from public.claim_invoice_email(
      (select id from public.invoices where order_id = '${ORDER(9)}'), 300)`);
  };

  it("se manda aunque SUNAT lo haya RECHAZADO", async () => {
    // Antes de la 0098 esto devolvía 0 filas y el comprador —que ya había
    // pagado— no recibía nada nunca, porque 'rechazado' es terminal.
    expect(await conEstado("rechazado")).toHaveLength(1);
  });

  it("se manda si quedó en error o vencido", async () => {
    expect(await conEstado("error")).toHaveLength(1);
    await montar();
    expect(await conEstado("vencido")).toHaveLength(1);
  });

  it("se manda cuando fue aceptado o quedó como interno", async () => {
    expect(await conEstado("aceptado")).toHaveLength(1);
    await montar();
    expect(await conEstado("omitido")).toHaveLength(1);
  });

  it("ESPERA mientras el envío a SUNAT sigue en curso", async () => {
    // Aquí sí hay que esperar: el PDF tiene que decir en qué situación acabó.
    expect(await conEstado("pendiente")).toHaveLength(0);
    await montar();
    expect(await conEstado("enviando")).toHaveLength(0);
  });
});

describe("0098 · la marca de prueba viaja con el comprobante", () => {
  // Importa porque el aviso «documento de prueba» del PDF y del correo se
  // decide con este dato. Si dependiera del entorno, un cliente REAL con su
  // comprobante interno recibiría un correo diciéndole que es una prueba.
  it("las reservas de emisión y de correo la devuelven", async () => {
    await encender("invoice_emission_enabled");
    await orden(20, { simulado: true });
    await liquidar(20, "SIMULADO");
    const id = `(select id from public.invoices where order_id = '${ORDER(20)}')`;

    const emision = await q<{ o_es_prueba: boolean }>(
      `select o_es_prueba from public.claim_invoice_emission(${id}, 300)`);
    expect(emision[0].o_es_prueba).toBe(true);

    await db.exec(`update public.invoices set sunat_status = 'aceptado' where order_id = '${ORDER(20)}';`);
    const correo = await q<{ o_es_prueba: boolean }>(
      `select o_es_prueba from public.claim_invoice_email(${id}, 300)`);
    expect(correo[0].o_es_prueba).toBe(true);
  });

  it("una compra real NO se marca como prueba", async () => {
    await encender("invoice_emission_enabled");
    await encender("invoice_emission_live");
    await orden(21);
    await liquidar(21, "izi-real");
    const correo = await q<{ o_es_prueba: boolean }>(`
      select o_es_prueba from public.claim_invoice_email(
        (select id from public.invoices where order_id = '${ORDER(21)}'), 300)`);
    // Está 'pendiente', así que el correo espera; lo que importa es que cuando
    // salga, no irá marcado.
    expect(correo).toHaveLength(0);
    expect((await comprobante(21)).es_prueba).toBe(false);
  });
});

describe("0098 · los que se pasan de plazo dejan de ser invisibles", () => {
  it("marca vencido y pide revisión", async () => {
    await encender("invoice_emission_enabled");
    await encender("invoice_emission_live");
    await orden(10);
    await liquidar(10, "izi-old");
    await db.exec(`
      update public.invoices set issued_at = now() - interval '9 days',
             sunat_fecha_emision = now() - interval '9 days'
       where order_id = '${ORDER(10)}';`);

    const n = await uno<{ expire_stale_invoices: number }>(
      `select public.expire_stale_invoices(3) as expire_stale_invoices`,
    );
    expect(n.expire_stale_invoices).toBe(1);

    const c = await uno<{ sunat_status: string; needs_review: boolean; sunat_last_error: string }>(
      `select sunat_status::text, needs_review, sunat_last_error
         from public.invoices where order_id = '${ORDER(10)}'`,
    );
    expect(c.sunat_status).toBe("vencido");
    expect(c.needs_review).toBe(true);
    expect(c.sunat_last_error).toMatch(/plazo/i);
  });

  it("no toca los que siguen en plazo", async () => {
    await encender("invoice_emission_enabled");
    await encender("invoice_emission_live");
    await orden(11);
    await liquidar(11, "izi-new");
    const n = await uno<{ expire_stale_invoices: number }>(
      `select public.expire_stale_invoices(3) as expire_stale_invoices`,
    );
    expect(n.expire_stale_invoices).toBe(0);
    expect((await comprobante(11)).sunat_status).toBe("pendiente");
  });

  it("el barrido cierra los vencidos antes de repartir trabajo", async () => {
    await encender("invoice_emission_enabled");
    await encender("invoice_emission_live");
    await orden(12);
    await liquidar(12, "izi-sweep");
    await db.exec(`
      update public.invoices set issued_at = now() - interval '9 days',
             sunat_fecha_emision = now() - interval '9 days'
       where order_id = '${ORDER(12)}';`);

    await db.exec(`select public.sweep_invoice_emissions(20);`);
    expect((await comprobante(12)).sunat_status).toBe("vencido");
  });
});

describe("0098 · sigue siendo seguro y repetible", () => {
  it("las funciones nuevas no quedan al alcance del navegador", async () => {
    const filas = await q<{ proname: string; acl: string | null }>(`
      select p.proname, array_to_string(p.proacl, ',') as acl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('invoice_emission_live', 'expire_stale_invoices',
                           'sweep_invoice_emissions', 'settle_paid_order')`);
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(f.acl ?? "").not.toMatch(/\banon=/);
      expect(f.acl ?? "").not.toMatch(/\bauthenticated=/);
    }
  });

  it("aplicarla dos veces no rompe nada", async () => {
    await db.exec(M0098);
    await encender("invoice_emission_enabled");
    await orden(13, { simulado: true });
    await liquidar(13, "SIMULADO");
    expect((await comprobante(13)).serie).toBe("B066");
  });

  it("liquidar dos veces sigue sin duplicar el comprobante", async () => {
    await orden(14);
    const a = await liquidar(14, "izi-1");
    const b = await liquidar(14, "izi-1");
    expect(a.settled).toBe(true);
    expect(b.settled).toBe(false);
    expect(await q(`select 1 from public.invoices where order_id = '${ORDER(14)}'`)).toHaveLength(1);
  });
});
