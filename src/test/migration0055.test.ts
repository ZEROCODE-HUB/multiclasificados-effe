// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0055 (fichero REAL) contra un Postgres de verdad.
 *
 * El buscador debe devolver primero los avisos URGENTES, luego los DESTACADOS y
 * por último los normales (documento eFFe). Dentro de cada grupo, el orden que
 * pida el usuario. Un fallo aquí quitaría el valor a las modalidades pagadas.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0055_search_priority_badges.sql"),
  "utf8",
);

let db: PGlite;

const ids = async (sort = "recent") => {
  const { rows } = await db.query<{ id: string }>(
    `select id from public.search_listings(null,null,null,null,null,null,null,null,null,$1,50,0)`,
    [sort],
  );
  return rows.map((r) => r.id);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create type public.currency as enum ('PEN','USD');
    -- Vista de tarjetas simplificada: solo las columnas que usa search_listings.
    create table public.listing_cards (
      id text primary key,
      title text, description text, location text,
      category_id text, subcategory_id uuid,
      price numeric, currency public.currency,
      lat numeric, lng numeric, views int,
      urgent boolean, featured boolean, confidential boolean,
      published_at timestamptz, created_at timestamptz
    );
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec(`delete from public.listing_cards;`);
  // n1 normal (más nuevo), d1 destacado, u1 urgente (el más viejo de todos).
  await db.exec(`
    insert into public.listing_cards (id, title, price, currency, views, urgent, featured, confidential, published_at, created_at) values
      ('n1','normal', 100,'PEN', 5, false,false,false, '2026-07-10','2026-07-10'),
      ('d1','destacado',100,'PEN',5, false,true, false, '2026-07-01','2026-07-01'),
      ('u1','urgente',100,'PEN',5, true, false,false, '2026-06-01','2026-06-01');
  `);
});

describe("search_listings — prioridad por modalidad", () => {
  it("urgente primero, luego destacado, luego normal (aunque sea el más viejo)", async () => {
    expect(await ids("recent")).toEqual(["u1", "d1", "n1"]);
  });

  it("la prioridad manda incluso ordenando por precio", async () => {
    // Todos al mismo precio: el desempate sigue siendo urgente > destacado > normal.
    expect(await ids("price_asc")).toEqual(["u1", "d1", "n1"]);
  });

  it("dos urgentes se ordenan entre sí por el criterio elegido (recientes)", async () => {
    await db.exec(`
      insert into public.listing_cards (id, title, price, currency, views, urgent, featured, confidential, published_at, created_at) values
        ('u2','urgente2',100,'PEN',5, true,false,false, '2026-07-09','2026-07-09');
    `);
    const order = await ids("recent");
    // u2 (2026-07-09) antes que u1 (2026-06-01); ambos antes que d1 y n1.
    expect(order.slice(0, 2)).toEqual(["u2", "u1"]);
    expect(order.indexOf("d1")).toBeGreaterThan(order.indexOf("u1"));
  });
});
