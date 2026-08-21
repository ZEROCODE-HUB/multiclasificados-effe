// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0120 — cuántos avisos hay en cada país.
 *
 * Lo que de verdad importa comprobar:
 *  1. Que el número que se enseña es el que devolverá el filtro. Si el contador
 *     dice 5 y al pulsar salen 3, es peor que no poner ninguno — de ahí que se
 *     cuente sobre `listing_cards`, la misma vista de la que sale el buscador.
 *  2. Que `anon` puede ejecutarla: el buscador se usa SIN sesión, y por la 0104
 *     una función nace sin permisos. Sin el grant, el contador vendría vacío en
 *     producción y el error se lo traga el cliente.
 *  3. Que el aviso de Bucarest que quedó como "Otro país" pasa a Rumanía, y que
 *     no se lleva por delante otros "XX".
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0120_avisos_por_pais.sql"),
  "utf8",
);

const YO = "00000000-0000-0000-0000-0000000000a1";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const num = async (sql: string) =>
  Number((await q<{ v: string }>(`select (${sql})::text as v`))[0].v);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;

    create table public.profiles (id uuid primary key, full_name text, rating numeric, verified boolean default false);
    create table public.listings (
      id uuid primary key default gen_random_uuid(), owner_id uuid, title text,
      location text, country text default 'PE', status text
    );

    create or replace view public.listing_cards as
      select l.id, l.title, l.location, l.status,
             coalesce(l.country, 'PE') as country
        from public.listings l
        join public.profiles p on p.id = l.owner_id
       where l.status = 'active';

    insert into public.profiles (id, full_name) values ('${YO}', 'Ana');
    insert into public.listings (owner_id, title, location, country, status) values
      ('${YO}', 'Depa en Lima',      'Miraflores', 'PE', 'active'),
      ('${YO}', 'Auto en Lima',      'San Isidro', 'PE', 'active'),
      ('${YO}', 'Moda en Europa',    'București',  'RO', 'active'),
      ('${YO}', 'Joyas de plata',    'Bucarest',   'XX', 'active'),
      ('${YO}', 'Algo en otro sitio','Kinshasa',   'XX', 'active'),
      ('${YO}', 'Borrador de Lima',  'Lima',       'PE', 'draft');
  `);
  await db.exec(MIG);
});

describe("0120 · el contador de avisos por país", () => {
  it("cuenta solo los activos: un borrador no es un aviso que se pueda ver", async () => {
    // La vista ya filtra por status; contar sobre `listings` habría dado 4 en Perú.
    expect(await num(`select total from public.avisos_activos_por_pais() where country = 'PE'`)).toBe(2);
  });

  it("el total coincide con lo que hay en la vista del buscador", async () => {
    const porPais = await q<{ country: string; total: string }>(
      `select country, total::text from public.avisos_activos_por_pais()`,
    );
    const suma = porPais.reduce((t, f) => t + Number(f.total), 0);
    expect(suma).toBe(await num(`select count(*) from public.listing_cards`));
  });

  it("no inventa países: solo salen los que tienen algo", async () => {
    const paises = (await q<{ country: string }>(
      `select country from public.avisos_activos_por_pais()`,
    )).map((f) => f.country).sort();
    // El "XX" de Bucarest ya es RO; queda el otro XX, que no era de allí.
    expect(paises).toEqual(["PE", "RO", "XX"]);
  });

  it("anon puede ejecutarla: el buscador funciona sin sesión", async () => {
    // Por la 0104 una función nace sin execute. Este es el fallo que dejó el
    // buscador devolviendo cero avisos durante 40 minutos en agosto.
    expect(await num(
      `select has_function_privilege('anon', 'public.avisos_activos_por_pais()', 'execute')::int`,
    )).toBe(1);
    expect(await num(
      `select has_function_privilege('authenticated', 'public.avisos_activos_por_pais()', 'execute')::int`,
    )).toBe(1);
  });
});

describe("0120 · los avisos de Bucarest", () => {
  it("el que quedó como «Otro país» pasa a Rumanía", async () => {
    expect(await num(
      `select count(*) from public.listings where country = 'RO' and location ilike '%bucarest%'`,
    )).toBe(1);
  });

  it("los dos de Bucarest quedan juntos, aunque se escribieran distinto", async () => {
    // Uno decía "București" y el otro "Bucarest": lo que los une es el país.
    expect(await num(`select count(*) from public.listings where country = 'RO'`)).toBe(2);
  });

  it("no arrastra otros «XX» que no eran de allí", async () => {
    const otro = await q<{ country: string }>(
      `select country from public.listings where location = 'Kinshasa'`,
    );
    expect(otro[0].country).toBe("XX");
  });
});
