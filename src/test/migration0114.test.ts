// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0114 — avisos de otros países.
 *
 * Lo delicado aquí no es la columna, es `search_listings`: cambia de firma, y
 * si la versión vieja sobreviviera, una llamada con parámetros por defecto sería
 * ambigua y Postgres la rechazaría… con el buscador devolviendo vacío en
 * silencio, porque el cliente se traga el error. Eso se prueba explícitamente.
 */
const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0114 = read("0114_avisos_de_otros_paises.sql");

const YO = "00000000-0000-0000-0000-0000000000a1";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const buscar = (args = "") =>
  q<{ title: string; country: string; department: string | null }>(
    `select title, country, department from public.search_listings(${args})`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create type public.currency as enum ('PEN', 'USD');

    create table public.profiles (
      id uuid primary key, full_name text, rating numeric, verified boolean default false
    );
    create table public.listings (
      id uuid primary key default gen_random_uuid(), owner_id uuid, title text, description text,
      price numeric, currency public.currency, condition text, category_id text, subcategory_id uuid,
      location text, department text, lat numeric, lng numeric, status text,
      featured boolean default false, urgent boolean default false, confidential boolean default false,
      views int default 0, published_at timestamptz default now(), created_at timestamptz default now(),
      expires_at timestamptz
    );
    create table public.listing_images (listing_id uuid, url text, sort_order int);

    -- La vista y la función tal como las dejó la 0087 (lo que hay hoy en la base).
    create or replace view public.listing_cards as
      select l.id, l.owner_id, l.title, l.description, l.price, l.currency, l.condition,
             l.category_id, l.subcategory_id, l.location, l.lat, l.lng, l.status,
             l.featured, l.urgent, l.confidential, l.views, l.published_at, l.created_at,
             l.expires_at, p.full_name as advertiser, p.rating as advertiser_rating,
             (select li.url from public.listing_images li where li.listing_id = l.id order by li.sort_order limit 1) as image_url,
             l.department, coalesce(p.verified, false) as advertiser_verified
        from public.listings l join public.profiles p on p.id = l.owner_id
       where l.status = 'active';

    create or replace function public.search_listings(
      p_query text default null, p_category text default null, p_subcategory uuid default null,
      p_price_min numeric default null, p_price_max numeric default null,
      p_currency public.currency default null, p_department text default null,
      p_sort text default 'recent', p_limit int default 24, p_offset int default 0,
      p_lat numeric default null, p_lng numeric default null
    ) returns setof public.listing_cards language sql stable as $$
      select lc.* from public.listing_cards lc
       where (p_department is null or p_department = '' or lc.department = p_department)
       limit greatest(0, p_limit);
    $$;

    insert into public.profiles (id, full_name) values ('${YO}', 'Ana');
    insert into public.listings (owner_id, title, category_id, status, department, location)
      values ('${YO}', 'Casa en Lima', 'inmuebles', 'active', '15', 'Miraflores'),
             ('${YO}', 'Casa en Piura', 'inmuebles', 'active', '20', 'Piura');
  `);
  await db.exec(MIG_0114);

  // Un aviso de fuera, ya con la columna aplicada.
  await db.exec(`
    insert into public.listings (owner_id, title, category_id, status, country, location)
      values ('${YO}', 'Depa en Santiago', 'inmuebles', 'active', 'CL', 'Providencia');
  `);
});

describe("0114 — el aviso guarda su país", () => {
  it("los avisos que ya existían son de Perú", async () => {
    const [r] = await q<{ n: string }>(
      `select count(*)::text as n from public.listings where country = 'PE'`);
    expect(Number(r.n)).toBe(2);
  });

  it("la vista del buscador expone el país", async () => {
    const filas = await q<{ country: string }>(
      `select country from public.listing_cards where title = 'Depa en Santiago'`);
    expect(filas[0].country).toBe("CL");
  });

  it("solo queda UNA versión de search_listings", async () => {
    // Con dos, una llamada con parámetros por defecto es ambigua y Postgres la
    // rechaza: el buscador se quedaría vacío sin decir por qué.
    const [r] = await q<{ n: string }>(
      `select count(*)::text as n from pg_proc where proname = 'search_listings'`);
    expect(r.n).toBe("1");
  });

  it("por defecto se busca en Perú: quien no toca nada ve lo de siempre", async () => {
    const filas = await buscar();
    expect(filas.map((f) => f.title).sort()).toEqual(["Casa en Lima", "Casa en Piura"]);
  });

  it("eligiendo otro país salen sus avisos, y solo los suyos", async () => {
    const filas = await buscar("p_country => 'CL'");
    expect(filas.map((f) => f.title)).toEqual(["Depa en Santiago"]);
  });

  it("sin país se ve todo el mundo", async () => {
    const filas = await buscar("p_country => null");
    expect(filas.length).toBe(3);
  });

  it("el departamento sigue filtrando dentro del Perú", async () => {
    const filas = await buscar("p_department => '15'");
    expect(filas.map((f) => f.title)).toEqual(["Casa en Lima"]);
  });

  it("un aviso extranjero no se cuela por el filtro de departamento", async () => {
    const filas = await buscar("p_country => 'CL', p_department => '15'");
    expect(filas).toEqual([]);
  });

  it("es re-ejecutable", async () => {
    await expect(db.exec(MIG_0114)).resolves.toBeDefined();
  });
});
