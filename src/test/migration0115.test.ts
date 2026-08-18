// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_SETTINGS } from "@/lib/pricing";

/**
 * 0115 — vídeos del aviso.
 *
 * Lo que importa comprobar:
 *  1. Que el precio del vídeo existe en el SERVIDOR con el mismo valor que en el
 *     cliente. Si divergen, se cobra una cosa y se cuenta otra.
 *  2. Que se cobra por día, como el resto de adicionales.
 *  3. Que el bucket tiene tope de tamaño y lista de tipos — y que los buckets
 *     viejos también, que hasta ahora no tenían ninguno.
 *  4. Que la tarjeta del buscador sabe si el aviso trae vídeo.
 */
const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0091 = read("0091_precio_en_el_servidor.sql");
const MIG_0114 = read("0114_avisos_de_otros_paises.sql");
const MIG_0115 = read("0115_videos_en_el_aviso.sql");

const YO = "00000000-0000-0000-0000-0000000000a1";
const AVISO = "00000000-0000-0000-0000-00000000c001";

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

    create type public.currency as enum ('PEN', 'USD');

    create table public.pricing_settings (
      id serial primary key, base numeric, desc_por_aviso numeric, desc_cantidad jsonb,
      saltos jsonb, extras jsonb, is_active boolean default true, updated_at timestamptz default now()
    );
    create table public.promotions (
      id serial primary key, name text, discount_pct numeric, starts_at timestamptz,
      ends_at timestamptz, category_ids text[] default '{}', is_active boolean default true
    );
    create table public.profiles (id uuid primary key, full_name text, rating numeric, verified boolean default false);
    create table public.listings (
      id uuid primary key default gen_random_uuid(), owner_id uuid, title text, description text,
      price numeric, currency public.currency, condition text, category_id text, subcategory_id uuid,
      location text, department text, country text default 'PE', lat numeric, lng numeric, status text,
      featured boolean default false, urgent boolean default false, confidential boolean default false,
      views int default 0, published_at timestamptz default now(), created_at timestamptz default now(),
      expires_at timestamptz, plan_duration_days int, plan_quantity int, plan_extras jsonb
    );
    create table public.listing_images (listing_id uuid, url text, sort_order int);
    create table public.user_credits (user_id uuid primary key, balance numeric, updated_at timestamptz);
    create table public.credit_transactions (
      id serial primary key, user_id uuid, type text, credits numeric,
      description text, listing_id uuid, order_id uuid, created_at timestamptz default now()
    );
    create function public.spend_credits(p_user_id uuid, p_credits numeric, p_listing_id uuid default null, p_description text default null)
      returns boolean language sql as $$ select true $$;

    -- Storage, lo mínimo para poder comprobar los límites del bucket.
    create schema if not exists storage;
    create table storage.buckets (
      id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (id serial primary key, bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql as $$
      select string_to_array(name, '/') $$;
    insert into storage.buckets (id, name, public) values
      ('listing-images', 'listing-images', true),
      ('listing-docs', 'listing-docs', false);

    -- La vista y la función tal como quedan tras la 0114.
    create or replace view public.listing_cards as
      select l.id, l.owner_id, l.title, l.description, l.price, l.currency, l.condition,
             l.category_id, l.subcategory_id, l.location, l.lat, l.lng, l.status,
             l.featured, l.urgent, l.confidential, l.views, l.published_at, l.created_at,
             l.expires_at, p.full_name as advertiser, p.rating as advertiser_rating,
             null::text as image_url, l.department,
             coalesce(p.verified, false) as advertiser_verified,
             coalesce(l.country, 'PE') as country
        from public.listings l join public.profiles p on p.id = l.owner_id
       where l.status = 'active';

    create or replace function public.search_listings(
      p_query text default null, p_category text default null, p_subcategory uuid default null,
      p_price_min numeric default null, p_price_max numeric default null,
      p_currency public.currency default null, p_department text default null,
      p_sort text default 'recent', p_limit int default 24, p_offset int default 0,
      p_lat numeric default null, p_lng numeric default null, p_country text default 'PE'
    ) returns setof public.listing_cards language sql stable as $$
      select lc.* from public.listing_cards lc limit greatest(0, p_limit);
    $$;
  `);
  await db.exec(MIG_0091);
  await db.exec(MIG_0115);

  const s = DEFAULT_SETTINGS;
  await db.exec(`
    insert into public.profiles (id, full_name) values ('${YO}', 'Ana');
    insert into public.pricing_settings (base, desc_por_aviso, desc_cantidad, saltos, extras, is_active)
    values (${s.base}, ${s.descPorAviso}, '${JSON.stringify(s.descCantidad)}'::jsonb,
            '${JSON.stringify(s.saltos)}'::jsonb, '${JSON.stringify(s.extras)}'::jsonb, true);
    insert into public.listings (id, owner_id, title, category_id, status)
      values ('${AVISO}', '${YO}', 'Casa con video', 'inmuebles', 'active');
  `);
});

describe("0115 · el precio del vídeo", () => {
  it("el servidor conoce la clave, con el mismo precio que el cliente", async () => {
    const r = await uno<{ v: string }>(`select (public.effe_pricing() -> 'extras' ->> 'video20') as v`);
    expect(Number(r.v)).toBe(DEFAULT_SETTINGS.extras.video20);
  });

  it("se cobra POR DÍA, como el resto de adicionales", async () => {
    // 2 vídeos × S/ 5 × 7 días = 70.
    const total = await num(
      `select public.effe_extras_total('{"video20":2}'::jsonb, 7, public.effe_pricing())`);
    expect(total).toBe(70);
  });

  it("la tarifa vigente gana la clave sin pisar lo que el admin haya puesto", async () => {
    await db.exec(`update public.pricing_settings set extras = '{"video20":2}'::jsonb where is_active;`);
    await db.exec(MIG_0115); // re-ejecutar no debe devolverla a 5
    const r = await uno<{ v: string }>(`select (extras ->> 'video20') as v from public.pricing_settings where is_active`);
    expect(Number(r.v)).toBe(2);
    // Se deja como estaba para los demás casos.
    await db.exec(`update public.pricing_settings set extras = '${JSON.stringify(DEFAULT_SETTINGS.extras)}'::jsonb where is_active;`);
  });
});

describe("0115 · el bucket y la tabla", () => {
  it("el bucket de vídeos es público, con tope y tipos permitidos", async () => {
    const b = await uno<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = 'listing-videos'`);
    // Público a propósito: una URL firmada caduca a media reproducción.
    expect(b.public).toBe(true);
    expect(Number(b.file_size_limit)).toBe(15 * 1024 * 1024);
    expect(b.allowed_mime_types).toContain("video/mp4");
    expect(b.allowed_mime_types).toContain("video/quicktime");
  });

  it("los buckets viejos dejan de estar sin límite", async () => {
    // El tope de 500 KB del PDF vivía SOLO en el navegador, o sea que no existía.
    const docs = await uno<{ l: string; t: string[] }>(
      `select file_size_limit::text as l, allowed_mime_types as t from storage.buckets where id = 'listing-docs'`);
    expect(Number(docs.l)).toBe(512000);
    expect(docs.t).toEqual(["application/pdf"]);

    const imgs = await uno<{ l: string }>(
      `select file_size_limit::text as l from storage.buckets where id = 'listing-images'`);
    expect(Number(imgs.l)).toBe(10485760);
  });

  it("los vídeos se guardan en orden y no se repite el sitio", async () => {
    await db.exec(`
      insert into public.listing_videos (listing_id, storage_path, url, duration_seconds, sort_order)
      values ('${AVISO}', 'u/1-a.mp4', 'https://cdn/a.mp4', 12.5, 0),
             ('${AVISO}', 'u/2-b.mp4', 'https://cdn/b.mp4', 18, 1);`);
    const filas = await q<{ url: string }>(
      `select url from public.listing_videos where listing_id = '${AVISO}' order by sort_order`);
    expect(filas.map((f) => f.url)).toEqual(["https://cdn/a.mp4", "https://cdn/b.mp4"]);

    await expect(db.exec(`
      insert into public.listing_videos (listing_id, storage_path, url, sort_order)
      values ('${AVISO}', 'u/otro.mp4', 'https://cdn/c.mp4', 0);`)).rejects.toThrow();
  });

  it("borrar el aviso se lleva sus vídeos", async () => {
    const otro = "00000000-0000-0000-0000-00000000c999";
    await db.exec(`
      insert into public.listings (id, owner_id, title, category_id, status)
        values ('${otro}', '${YO}', 'Temporal', 'autos', 'active');
      insert into public.listing_videos (listing_id, storage_path, url, sort_order)
        values ('${otro}', 'u/x.mp4', 'https://cdn/x.mp4', 0);
      delete from public.listings where id = '${otro}';`);
    expect(await num(`select count(*) from public.listing_videos where listing_id = '${otro}'`)).toBe(0);
  });

  it("la tarjeta del buscador dice cuántos vídeos trae", async () => {
    const r = await uno<{ video_count: number }>(
      `select video_count from public.listing_cards where id = '${AVISO}'`);
    expect(Number(r.video_count)).toBe(2);
  });

  it("solo queda UNA versión de search_listings", async () => {
    const r = await uno<{ n: string }>(
      `select count(*)::text as n from pg_proc where proname = 'search_listings'`);
    expect(r.n).toBe("1");
  });

  it("es re-ejecutable", async () => {
    await expect(db.exec(MIG_0115)).resolves.toBeDefined();
  });
});
