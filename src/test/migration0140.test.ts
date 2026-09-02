// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0140 — el aviso renovado vuelve a avisar.
 *
 * DOS FALLOS QUE SE TAPABAN EL UNO AL OTRO.
 *
 *  1. El aviso de vencimiento se manda UNA VEZ y se marca en el aviso
 *     (`expiry_notified_85_at`). `effe_renovar_aviso` limpiaba dos de las tres
 *     marcas, pero no esa: se añadió después, en la 0133, y nadie volvió a
 *     tocar la función. Resultado: **un aviso renovado no volvía a advertir de
 *     su vencimiento nunca más.** Se renovaba una vez y a partir de ahí caducaba
 *     en silencio. Republicar tenía el mismo problema y con las tres marcas.
 *
 *  2. `plan_duration_days` se quedaba con el plan ORIGINAL. Y esa columna es de
 *     la que sale el umbral del 85 % en los dos lados —la base de datos y la
 *     app—, así que renovar 30 días un aviso de plan 7 dejaba a los dos
 *     calculando con la cifra equivocada. En producción hay avisos con
 *     `plan_duration_days = 7` y 7,5 días por delante: son renovados.
 *
 * El segundo es el que explica lo que reportó el cliente en el punto 08: llega
 * la campanita de "tu aviso está por vencer", pulsa, la fila se resalta... y no
 * hay ningún botón para renovar.
 */
const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0091 = read("0091_precio_en_el_servidor.sql");
const MIG_0096 = read("0096_pagar_y_publicar.sql");
const MIG_0110 = read("0110_tipo_de_documento_pasaporte.sql");
const MIG_0111 = read("0111_comprobante_para_extranjeros.sql");
const MIG_0113 = read("0113_renovar_el_aviso.sql");
const MIG_0140 = read("0140_el_aviso_renovado_vuelve_a_avisar.sql");

/**
 * La reparación de una vez, suelta.
 *
 * Se saca del archivo en vez de copiarla aquí: si alguien la cambia y esta
 * prueba siguiera comprobando la versión vieja, no serviría de nada. Y se
 * ejecuta aparte porque tiene que correr DESPUÉS de sembrar los avisos, no
 * sobre una tabla vacía.
 */
const REPARACION = MIG_0140.slice(
  MIG_0140.indexOf("update public.listings\n   set expiry_notified_85_at"),
).split(";")[0] + ";";

const YO = "00000000-0000-0000-0000-0000000000a1";
const AVISO = "00000000-0000-0000-0000-00000000c001";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const uno = async <T,>(sql: string): Promise<T> => (await q<T>(sql))[0];

const marcas = () =>
  uno<{ m85: string | null; m1h: string | null; m3d: string | null; plan: number | null }>(
    `select expiry_notified_85_at::text as m85, expiry_notified_at::text as m1h,
            expiry_notified_3d_at::text as m3d, plan_duration_days as plan
       from public.listings where id = '${AVISO}'`,
  );

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
      -- La añade la 0133 en producción. Aquí va en la tabla porque esa migración
      -- arrastra medio esquema y lo que se prueba es la 0140.
      expiry_notified_85_at timestamptz,
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
    end $$;

    create table public.avisos_enviados (user_id uuid, tipo text, payload jsonb);
    create function public.notify_user(a uuid, b text, c text, d jsonb) returns void
      language sql as $$ insert into public.avisos_enviados values (a, b, d) $$;
  `);
  await db.exec(MIG_0091);
  await db.exec(MIG_0096);
  await db.exec(MIG_0110);
  await db.exec(MIG_0111);
  await db.exec(MIG_0113);
  await db.exec(MIG_0140);

  await db.exec(`
    insert into public.pricing_settings (base, desc_por_aviso, desc_cantidad, saltos, extras, is_active)
    values (16.14, 0.5, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, true);
  `);
});

beforeEach(() => db.exec(`
  reset role; set test.uid = '';
  delete from public.avisos_enviados; delete from public.credit_transactions;
  delete from public.listings;
  insert into public.user_credits (user_id, balance, updated_at)
    values ('${YO}', 1000, now())
    on conflict (user_id) do update set balance = 1000;
`));

/** Un aviso con las TRES marcas puestas, como queda tras avisar de su vencimiento. */
const avisado = (estado: string, plan: number, diasRestantes: number) => db.exec(`
  insert into public.listings (id, owner_id, category_id, status, title, plan_quantity,
                               plan_duration_days, plan_extras, published_at, expires_at,
                               expiry_notified_85_at, expiry_notified_at, expiry_notified_3d_at)
  values ('${AVISO}', '${YO}', 'autos', '${estado}', 'Casa bonita', 1, ${plan}, '{}'::jsonb,
          now() - interval '${plan} days', now() + interval '${diasRestantes} days',
          now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour');
`);

describe("renovar deja el aviso listo para volver a advertir", () => {
  it("limpia LA MARCA DEL 85 %, que era la que se quedaba puesta", async () => {
    // Es el fallo entero: la 0113 limpiaba las otras dos, y esta se añadió
    // después. Sin limpiarla, el aviso renovado no vuelve a advertir jamás.
    await avisado("active", 7, 1);
    await db.exec(`select public.effe_renovar_aviso('${AVISO}', 7, '${YO}');`);
    expect((await marcas()).m85).toBeNull();
  });

  it("y también las otras dos", async () => {
    await avisado("active", 7, 1);
    await db.exec(`select public.effe_renovar_aviso('${AVISO}', 7, '${YO}');`);
    const m = await marcas();
    expect(m.m1h).toBeNull();
    expect(m.m3d).toBeNull();
  });

  it("guarda la duración QUE SE ACABA DE PAGAR, no la del plan viejo", async () => {
    // De esta columna sale el umbral del 85 % en la base Y en la app. Con el
    // plan viejo, renovar 30 días un aviso de plan 7 dejaba a los dos midiendo
    // sobre siete: la app decidía que aún no tocaba enseñar "Renovar".
    await avisado("active", 7, 1);
    await db.exec(`select public.effe_renovar_aviso('${AVISO}', 30, '${YO}');`);
    expect((await marcas()).plan).toBe(30);
  });

  it("sigue SIN mover published_at", async () => {
    // Lo que la 0113 decidió a propósito y la 0140 no puede deshacer: si se
    // moviera, renovar sería la forma barata de reencabezar "recientes" y quien
    // renueva cada semana enterraría a quien publica por primera vez.
    await avisado("active", 7, 1);
    const antes = await uno<{ p: string }>(`select published_at::text as p from public.listings where id = '${AVISO}'`);
    await db.exec(`select public.effe_renovar_aviso('${AVISO}', 30, '${YO}');`);
    const despues = await uno<{ p: string }>(`select published_at::text as p from public.listings where id = '${AVISO}'`);
    expect(despues.p).toBe(antes.p);
  });

  it("y sigue SUMANDO los días a lo que quedaba", async () => {
    // La otra decisión de la 0113: renovar cuatro días antes de vencer no tira
    // esos cuatro días a la basura.
    await avisado("active", 7, 4);
    await db.exec(`select public.effe_renovar_aviso('${AVISO}', 7, '${YO}');`);
    const dias = Number((await uno<{ d: string }>(
      `select extract(day from (expires_at - now()))::text as d from public.listings where id = '${AVISO}'`,
    )).d);
    expect(dias).toBeGreaterThanOrEqual(10);
    expect(dias).toBeLessThanOrEqual(11);
  });
});

describe("republicar hace lo mismo", () => {
  it("un aviso vencido vuelve con las tres marcas a cero", async () => {
    // Arrastraba las marcas de su vida anterior, así que tampoco volvía a
    // advertir nunca. Y este caso es peor: el aviso YA venció una vez, o sea
    // que el anunciante ya demostró que el recordatorio le hace falta.
    await avisado("expired", 7, -3);
    await db.exec(`select public.effe_publish_listing('${AVISO}', 7, '${YO}');`);
    const m = await marcas();
    expect(m.m85).toBeNull();
    expect(m.m1h).toBeNull();
    expect(m.m3d).toBeNull();
  });

  it("y guarda la duración pagada", async () => {
    await avisado("expired", 7, -3);
    await db.exec(`select public.effe_publish_listing('${AVISO}', 30, '${YO}');`);
    expect((await marcas()).plan).toBe(30);
  });

  it("sigue sin dejar publicar un aviso ya activo", async () => {
    // El límite de siempre: 'active' no está en la lista, para no regalar
    // vigencia. Republicar es para los vencidos; para un aviso vivo está
    // renovar, que sí cobra el paquete entero.
    await avisado("active", 7, 4);
    await expect(db.exec(`select public.effe_publish_listing('${AVISO}', 7, '${YO}');`))
      .rejects.toThrow(/no encontrado|ya publicado|sin permiso/i);
  });
});

describe("la reparación de los que ya estaban vivos con la marca puesta", () => {
  it("le quita la marca al que tiene más tiempo del que su plan permite", async () => {
    // Señal inequívoca de que se renovó o se republicó: la marca que lleva es
    // de una vigencia que ya no es la suya.
    await avisado("active", 7, 6);
    await db.exec(REPARACION);
    expect((await marcas()).m85).toBeNull();
  });

  it("y NO se la quita al que de verdad está por vencer", async () => {
    // A un aviso al que le quedan horas no se le reabre el aviso del 85 %:
    // llegaría tarde y por duplicado.
    await avisado("active", 30, 2);
    await db.exec(REPARACION);
    expect((await marcas()).m85).not.toBeNull();
  });

  it("no toca los avisos que no están activos", async () => {
    // Un vencido se republica, y al republicarse las marcas se limpian solas.
    // Tocarlo aquí sería mandarle un "está por vencer" a un aviso ya caducado.
    await avisado("expired", 7, -3);
    await db.exec(REPARACION);
    expect((await marcas()).m85).not.toBeNull();
  });

  it("se saca del archivo de la migración y no es una copia", () => {
    // Si fuera una copia, cambiar la migración dejaría esta prueba comprobando
    // una versión que ya no existe.
    expect(REPARACION).toContain("expiry_notified_85_at = null");
    expect(REPARACION).toContain("status = 'active'");
  });
});
