// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0098 + 0099 — la aplicación entera está en pruebas o en producción.
 *
 * Mientras `app_produccion` esté en false, TODO lo que se cobra es de prueba:
 * da igual que el pago entre por Izipay, porque Izipay también está en modo
 * test. Lo que se protege aquí:
 *
 *  1. Que en pruebas los comprobantes usen SUS series (B066/F066) y jamás
 *     toquen el contador de las reales. Un correlativo saltado de la serie
 *     buena hay que justificarlo ante SUNAT.
 *  2. Que al pasar a producción se numere con las series de verdad, sin marca.
 *  3. Que el correo salga aunque SUNAT rechace: el comprador ya pagó y tiene
 *     derecho a su comprobante. Antes se quedaba sin él para siempre.
 *  4. Que un comprobante fuera de plazo se marque y salga a revisión, en vez
 *     de quedarse mudo en 'pendiente' como pasaba.
 *  5. Que la marca de prueba viaje con el comprobante hasta el PDF y el correo.
 */

const leer = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/", f), "utf8");

const M0082 = leer("0082_invoice_series.sql");
const M0083 = leer("0083_invoice_emission.sql");
const M0098 = leer("0098_emision_de_pruebas.sql");
const M0099 = leer("0099_modo_de_la_aplicacion.sql");

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
  await db.exec(M0099);
}

const orden = (n: number, tipo: "boleta" | "factura" = "boleta") =>
  db.exec(`
    insert into public.orders (id, user_id, extras, subtotal, igv, total, status, payment_provider)
    values ('${ORDER(n)}', '${USER}',
      jsonb_build_object('credits', 10, 'detail', 'Compra de saldo',
        'receipt', jsonb_build_object('receiptType', '${tipo}',
          'email', 'a@b.com', 'advertiserName', 'JUAN', 'docType', 'dni', 'docNumber', '44443333')),
      100, 18, 118, 'pending', 'izipay');
  `);

const liquidar = (n: number, ref = "izi-1") =>
  uno<{ settle_paid_order: Record<string, unknown> }>(
    `select public.settle_paid_order('${ORDER(n)}', '${ref}') as settle_paid_order`,
  ).then((r) => r.settle_paid_order);

const encender = (clave: string) =>
  db.exec(`update public.system_settings set value = 'true'::jsonb where key = '${clave}';`);

const comprobante = (n: number) =>
  uno<{ number: string; serie: string; es_prueba: boolean; sunat_status: string }>(
    `select number, serie, es_prueba, sunat_status::text
       from public.invoices where order_id = '${ORDER(n)}'`,
  );

beforeEach(montar);

describe("modo pruebas · nada toca las series fiscales de verdad", () => {
  it("la app arranca en pruebas", async () => {
    expect((await uno<{ p: boolean }>(`select public.app_produccion() as p`)).p).toBe(false);
  });

  it("un pago de Izipay en pruebas se marca como prueba y usa B066", async () => {
    // Izipay está en modo test: ese cobro tampoco es real, aunque venga de la
    // pasarela. Marcarlo como real sería describir mal lo que pasó.
    await encender("invoice_emission_enabled");
    await orden(1);
    const r = await liquidar(1);

    expect(r.es_prueba).toBe(true);
    const c = await comprobante(1);
    expect(c.serie).toBe("B066");
    expect(c.number).toBe("B066-000001");
    expect(c.sunat_status).toBe("pendiente");
  });

  it("la factura de prueba usa F066", async () => {
    await encender("invoice_emission_enabled");
    await orden(2, "factura");
    await liquidar(2);
    expect((await comprobante(2)).serie).toBe("F066");
  });

  it("por muchas compras que haya, el contador REAL no se mueve", async () => {
    await encender("invoice_emission_enabled");
    const antes = await uno<{ c: string }>(
      `select correlativo::text as c from public.invoice_series where id = 'boleta'`);

    for (const n of [3, 4, 5]) { await orden(n); await liquidar(n); }

    const d = await uno<{ c: string; p: string }>(
      `select correlativo::text as c, correlativo_pruebas::text as p
         from public.invoice_series where id = 'boleta'`);
    expect(d.c).toBe(antes.c);   // intacto
    expect(Number(d.p)).toBe(3);
  });

  it("sin el interruptor de emisión, el comprobante es interno pero sigue siendo de prueba", async () => {
    await orden(6);
    await liquidar(6);
    const c = await comprobante(6);
    expect(c.sunat_status).toBe("omitido");
    expect(c.es_prueba).toBe(true);
    expect(c.serie).toBe("B066");
  });
});

describe("modo producción · se numera de verdad y sin marcas", () => {
  it("al pasar a producción se usan las series reales", async () => {
    await encender("invoice_emission_enabled");
    await encender("app_produccion");
    await orden(7);
    const r = await liquidar(7);

    expect(r.es_prueba).toBe(false);
    const c = await comprobante(7);
    expect(c.serie).toBe("B001");
    expect(c.es_prueba).toBe(false);
    expect(c.sunat_status).toBe("pendiente");
  });

  it("el contador real avanza y el de pruebas se queda quieto", async () => {
    await encender("invoice_emission_enabled");
    await encender("app_produccion");
    const antes = await uno<{ c: number }>(
      `select correlativo as c from public.invoice_series where id = 'boleta'`);
    await orden(8); await liquidar(8);
    const d = await uno<{ c: number; p: number }>(
      `select correlativo as c, correlativo_pruebas as p from public.invoice_series where id = 'boleta'`);
    expect(d.c).toBe(antes.c + 1);
    expect(d.p).toBe(0);
  });
});

describe("la marca de prueba viaja con el comprobante", () => {
  // Importa porque el aviso «sin valor fiscal» del PDF y del correo se decide
  // con este dato, no con el entorno al que apunte la función.
  it("las reservas de emisión y de correo la devuelven", async () => {
    await encender("invoice_emission_enabled");
    await orden(9);
    await liquidar(9);
    const id = `(select id from public.invoices where order_id = '${ORDER(9)}')`;

    const emision = await q<{ o_es_prueba: boolean }>(
      `select o_es_prueba from public.claim_invoice_emission(${id}, 300)`);
    expect(emision[0].o_es_prueba).toBe(true);

    await db.exec(`update public.invoices set sunat_status='aceptado' where order_id='${ORDER(9)}';`);
    const correo = await q<{ o_es_prueba: boolean }>(
      `select o_es_prueba from public.claim_invoice_email(${id}, 300)`);
    expect(correo[0].o_es_prueba).toBe(true);
  });
});

describe("el comprobante llega al comprador pase lo que pase", () => {
  const conEstado = async (estado: string) => {
    await encender("invoice_emission_enabled");
    await orden(10);
    await liquidar(10);
    await db.exec(`
      update public.invoices set sunat_status = '${estado}', email_status = 'pendiente',
             email_next_try_at = now()
       where order_id = '${ORDER(10)}';`);
    return q(`select * from public.claim_invoice_email(
      (select id from public.invoices where order_id = '${ORDER(10)}'), 300)`);
  };

  it("se manda aunque SUNAT lo haya RECHAZADO", async () => {
    // Antes esto devolvía 0 filas y el comprador —que ya había pagado— no
    // recibía nada nunca, porque 'rechazado' es un estado terminal.
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

describe("los que se pasan de plazo dejan de ser invisibles", () => {
  const viejo = async (n: number) => {
    await encender("invoice_emission_enabled");
    await orden(n);
    await liquidar(n);
    await db.exec(`
      update public.invoices set issued_at = now() - interval '9 days',
             sunat_fecha_emision = now() - interval '9 days'
       where order_id = '${ORDER(n)}';`);
  };

  it("marca vencido y pide revisión", async () => {
    await viejo(11);
    const n = await uno<{ v: number }>(`select public.expire_stale_invoices(3) as v`);
    expect(n.v).toBe(1);

    const c = await uno<{ sunat_status: string; needs_review: boolean; sunat_last_error: string }>(
      `select sunat_status::text, needs_review, sunat_last_error
         from public.invoices where order_id = '${ORDER(11)}'`);
    expect(c.sunat_status).toBe("vencido");
    expect(c.needs_review).toBe(true);
    expect(c.sunat_last_error).toMatch(/plazo/i);
  });

  it("no toca los que siguen en plazo", async () => {
    await encender("invoice_emission_enabled");
    await orden(12);
    await liquidar(12);
    expect((await uno<{ v: number }>(`select public.expire_stale_invoices(3) as v`)).v).toBe(0);
    expect((await comprobante(12)).sunat_status).toBe("pendiente");
  });

  it("el barrido los cierra antes de repartir trabajo", async () => {
    await viejo(13);
    await db.exec(`select public.sweep_invoice_emissions(20);`);
    expect((await comprobante(13)).sunat_status).toBe("vencido");
  });
});

describe("sigue siendo seguro y repetible", () => {
  it("las funciones sensibles no quedan al alcance del navegador", async () => {
    const filas = await q<{ proname: string; acl: string | null }>(`
      select p.proname, array_to_string(p.proacl, ',') as acl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('expire_stale_invoices', 'sweep_invoice_emissions',
                           'settle_paid_order', 'claim_invoice_emission')`);
    expect(filas.length).toBeGreaterThan(0);
    for (const f of filas) {
      expect(f.acl ?? "").not.toMatch(/\banon=/);
      expect(f.acl ?? "").not.toMatch(/\bauthenticated=/);
    }
  });

  it("aplicar las migraciones dos veces no rompe nada", async () => {
    await db.exec(M0098);
    await db.exec(M0099);
    await encender("invoice_emission_enabled");
    await orden(14);
    await liquidar(14);
    expect((await comprobante(14)).serie).toBe("B066");
  });

  it("liquidar dos veces sigue sin duplicar el comprobante", async () => {
    await orden(15);
    expect((await liquidar(15)).settled).toBe(true);
    expect((await liquidar(15)).settled).toBe(false);
    expect(await q(`select 1 from public.invoices where order_id = '${ORDER(15)}'`)).toHaveLength(1);
  });
});
