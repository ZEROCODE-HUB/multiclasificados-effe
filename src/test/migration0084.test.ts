// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0084 (fichero REAL) contra un Postgres de verdad.
 *
 * El departamento es el único criterio por el que se filtra la ubicación, así
 * que lo que hay que garantizar es que no se esconde lo que corresponde ni se
 * cuela lo que no:
 *   - elegir un departamento devuelve SOLO sus avisos;
 *   - Lima y Callao cuentan como el mismo sitio;
 *   - sin departamento se ve todo el país;
 *   - los avisos ya publicados heredan el departamento de su texto, sin
 *     confundir "Limatambo" con Lima;
 *   - los Urgente y Destacado encabezan solo dentro del departamento que se mira.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0084_listing_department.sql"),
  "utf8",
);

let db: PGlite;

const ID = (n: number) => `${String(n).padStart(8, "0")}-0000-0000-0000-000000000000`;

async function montar() {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create type public.currency as enum ('PEN','USD');

    create table public.profiles (id uuid primary key, full_name text, rating numeric);
    insert into public.profiles values ('${ID(99)}', 'Anunciante', 5);

    create table public.listings (
      id uuid primary key, owner_id uuid references public.profiles(id),
      title text, description text, price numeric, currency public.currency,
      condition text, category_id text, subcategory_id uuid,
      location text, lat numeric, lng numeric, status text default 'active',
      featured boolean default false, urgent boolean default false,
      confidential boolean default false, views int default 0,
      published_at timestamptz default now(), created_at timestamptz default now(),
      expires_at timestamptz
    );
    create table public.listing_images (listing_id uuid, url text, sort_order int);

    create or replace view public.listing_cards as
      select l.id, l.owner_id, l.title, l.description, l.price, l.currency,
             l.condition, l.category_id, l.subcategory_id, l.location, l.lat, l.lng,
             l.status, l.featured, l.urgent, l.confidential, l.views,
             l.published_at, l.created_at, l.expires_at,
             p.full_name as advertiser, p.rating as advertiser_rating,
             null::text as image_url
        from public.listings l join public.profiles p on p.id = l.owner_id
       where l.status = 'active';
  `);
  await db.exec(MIGRATION);
}

const aviso = (n: number, location: string, extra = "") =>
  db.exec(`insert into public.listings (id, owner_id, title, price, currency, location ${extra ? ", " + extra.split("=")[0] : ""})
           values ('${ID(n)}', '${ID(99)}', 'Aviso ${n}', 100, 'PEN', '${location}'
                   ${extra ? ", " + extra.split("=")[1] : ""});`);

const buscar = async (dep: string | null) => {
  const { rows } = await db.query<{ title: string }>(
    `select title from public.search_listings(null,null,null,null,null,null,${dep ? `'${dep}'` : "null"},'recent',50,0)`,
  );
  return rows.map((r) => r.title);
};

const departamentoDe = async (n: number) => {
  const { rows } = await db.query<{ department: string | null }>(
    `select department from public.listings where id = '${ID(n)}'`,
  );
  return rows[0].department;
};

beforeEach(montar);

describe("0084 — filtrar por departamento", () => {
  beforeEach(async () => {
    await aviso(1, "Miraflores, Lima");
    await aviso(2, "Bellavista, Callao");
    await aviso(3, "Cayma, Arequipa");
    await aviso(4, "Trujillo, La Libertad");
    await db.exec(MIGRATION); // les asigna el departamento desde su texto
  });

  it("elegir un departamento devuelve solo sus avisos", async () => {
    expect(await buscar("04")).toEqual(["Aviso 3"]);
    expect(await buscar("13")).toEqual(["Aviso 4"]);
  });

  it("Lima y Callao son el mismo sitio", async () => {
    // Bellavista está a 11 km del centro de Lima: separarlos escondería avisos
    // que el usuario tiene cruzando la avenida.
    const r = await buscar("15");
    expect(r.sort()).toEqual(["Aviso 1", "Aviso 2"]);
  });

  it("sin departamento elegido se ve todo el país", async () => {
    expect((await buscar(null)).length).toBe(4);
  });

  it("un departamento sin avisos devuelve vacío, no todo", async () => {
    expect(await buscar("21")).toEqual([]);
  });
});

describe("0084 — departamento de los avisos ya publicados", () => {
  it("lo deduce del texto que escribieron sus dueños", async () => {
    await aviso(1, "Miraflores, Lima");
    await aviso(2, "Cayma, Arequipa");
    await aviso(3, "Tarapoto, San Martín");
    await db.exec(MIGRATION); // el backfill corre dentro de la migración

    expect(await departamentoDe(1)).toBe("15");
    expect(await departamentoDe(2)).toBe("04");
    expect(await departamentoDe(3)).toBe("22");
  });

  it("el Callao queda junto a Lima", async () => {
    await aviso(1, "Bellavista, Callao");
    await db.exec(MIGRATION);
    expect(await departamentoDe(1)).toBe("15");
  });

  it("acierta sin tildes y en mayúsculas", async () => {
    await aviso(1, "HUANUCO");
    await aviso(2, "ancash");
    await db.exec(MIGRATION);
    expect(await departamentoDe(1)).toBe("10");
    expect(await departamentoDe(2)).toBe("02");
  });

  it("NO confunde una palabra que solo empieza igual", async () => {
    // "Limatambo" es un distrito del Cusco. Si esto fallara, el aviso saldría
    // en las búsquedas de Lima, que es justo el error que hay que evitar.
    await aviso(1, "Limatambo");
    await db.exec(MIGRATION);
    expect(await departamentoDe(1)).not.toBe("15");
  });

  it("deja sin departamento lo que no nombra ninguno", async () => {
    await aviso(1, "A domicilio en todo el país");
    await aviso(2, "Online");
    await db.exec(MIGRATION);
    expect(await departamentoDe(1)).toBeNull();
    expect(await departamentoDe(2)).toBeNull();
  });

  it("no pisa el departamento de un aviso que ya lo tiene", async () => {
    await aviso(1, "Miraflores, Lima");
    await db.exec(`update public.listings set department = '04' where id = '${ID(1)}'`);
    await db.exec(MIGRATION);
    expect(await departamentoDe(1)).toBe("04");
  });
});

describe("0084 — prioridad de Urgente y Destacado", () => {
  beforeEach(async () => {
    await aviso(1, "Miraflores, Lima");
    await aviso(2, "Cayma, Arequipa", "urgent=true");
    await aviso(3, "San Isidro, Lima", "urgent=true");
    await db.exec(MIGRATION);
  });

  it("el urgente de otro departamento no encabeza tu búsqueda", async () => {
    // Sin filtro, se ven todos; pero el urgente de Arequipa no debe adelantar
    // a los de Lima cuando el usuario está mirando Lima.
    const r = await buscar("15");
    expect(r[0]).toBe("Aviso 3");
    expect(r).not.toContain("Aviso 2");
  });

  it("sin departamento elegido, los urgentes encabezan como siempre", async () => {
    const r = await buscar(null);
    expect(r.slice(0, 2).sort()).toEqual(["Aviso 2", "Aviso 3"]);
  });
});

describe("0084 — repetible", () => {
  it("se puede volver a aplicar sin romper nada", async () => {
    await aviso(1, "Miraflores, Lima");
    await db.exec(MIGRATION);
    await db.exec(MIGRATION);
    expect(await departamentoDe(1)).toBe("15");
    expect(await buscar("15")).toEqual(["Aviso 1"]);
  });
});
