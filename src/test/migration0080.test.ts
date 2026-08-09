// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0080 (fichero REAL) contra un Postgres de verdad.
 *
 * Un aviso Urgente encabezaba la búsqueda en todo el país: quien buscaba desde
 * Trujillo veía arriba avisos de Lima que no le sirven. Ahora esa prioridad se
 * aplica solo dentro de la zona de quien mira; los de fuera mantienen su
 * insignia pero compiten en el orden normal.
 *
 * Y el punto de referencia ya no implica esconder lo de fuera: filtrar es
 * decisión aparte (p_radius_km), porque el buscador manda la ubicación siempre
 * para poder decidir esta prioridad.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0080_search_priority_by_zone.sql"),
  "utf8",
);

let db: PGlite;

// Coordenadas reales del catálogo de zonas.
const LIMA = { lat: -12.0453, lng: -77.0308 };
const TRUJILLO = { lat: -8.115, lng: -79.0298 };

async function buscar(opts: {
  lat?: number;
  lng?: number;
  radio?: number | null;
  sort?: string;
} = {}) {
  const { rows } = await db.query<{ id: string }>(
    `select id from public.search_listings(
       null, null, null, null, null, null, $1, $2, $3, $4, 50, 0)`,
    [opts.lat ?? null, opts.lng ?? null, opts.radio ?? null, opts.sort ?? "recent"],
  );
  return rows.map((r) => r.id);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create type public.currency as enum ('PEN','USD');
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
  // Un urgente y un destacado en Trujillo; uno normal y otro urgente en Lima.
  await db.exec(`
    insert into public.listing_cards
      (id, title, price, currency, views, lat, lng, urgent, featured, confidential, published_at, created_at) values
      ('lima_normal',   'normal Lima',      100,'PEN',5, ${LIMA.lat},     ${LIMA.lng},     false,false,false,'2026-07-10','2026-07-10'),
      ('lima_urgente',  'urgente Lima',     100,'PEN',5, ${LIMA.lat},     ${LIMA.lng},     true, false,false,'2026-06-01','2026-06-01'),
      ('truj_urgente',  'urgente Trujillo', 100,'PEN',5, ${TRUJILLO.lat}, ${TRUJILLO.lng}, true, false,false,'2026-05-01','2026-05-01'),
      ('truj_destacado','destacado Truj',   100,'PEN',5, ${TRUJILLO.lat}, ${TRUJILLO.lng}, false,true, false,'2026-04-01','2026-04-01');
  `);
});

describe("search_listings — prioridad acotada a la zona", () => {
  it("sin ubicación se comporta como antes: los urgentes primero, sean de donde sean", async () => {
    const orden = await buscar();
    // Los dos urgentes arriba (entre ellos, por fecha), luego el destacado.
    expect(orden.slice(0, 2).sort()).toEqual(["lima_urgente", "truj_urgente"]);
    expect(orden[2]).toBe("truj_destacado");
  });

  it("buscando desde Trujillo, el urgente de Lima NO encabeza", async () => {
    const orden = await buscar(TRUJILLO);
    expect(orden[0]).toBe("truj_urgente");
    expect(orden[1]).toBe("truj_destacado");
    // El urgente de Lima cae al montón, por detrás del destacado local.
    expect(orden.indexOf("lima_urgente")).toBeGreaterThan(orden.indexOf("truj_destacado"));
  });

  it("buscando desde Lima manda el urgente de Lima", async () => {
    const orden = await buscar(LIMA);
    expect(orden[0]).toBe("lima_urgente");
    // Y el urgente de Trujillo pierde su prioridad: aquí no aporta.
    expect(orden.indexOf("truj_urgente")).toBeGreaterThan(orden.indexOf("lima_normal"));
  });

  it("los avisos de fuera siguen apareciendo, solo que sin privilegio", async () => {
    const orden = await buscar(TRUJILLO);
    expect(orden).toHaveLength(4);
    expect(orden).toContain("lima_urgente");
    expect(orden).toContain("lima_normal");
  });

  it("un aviso sin coordenadas no se pierde de la lista", async () => {
    await db.exec(`
      insert into public.listing_cards (id, title, price, currency, views, urgent, featured, confidential, published_at, created_at)
      values ('sin_punto','sin coordenadas',100,'PEN',5,false,false,false,'2026-07-11','2026-07-11');
    `);
    expect(await buscar(LIMA)).toContain("sin_punto");
  });
});

describe("search_listings — el radio es decisión aparte", () => {
  it("con ubicación pero SIN radio no esconde nada", async () => {
    // Este es el cambio de contrato: antes, mandar lat/lng sin radio no hacía
    // nada; ahora sirve para la prioridad y sigue sin filtrar.
    expect(await buscar(TRUJILLO)).toHaveLength(4);
  });

  it("con radio deja solo lo que cae dentro", async () => {
    const orden = await buscar({ ...TRUJILLO, radio: 50 });
    expect(orden.sort()).toEqual(["truj_destacado", "truj_urgente"]);
  });

  it("con radio, un aviso sin coordenadas queda fuera", async () => {
    await db.exec(`
      insert into public.listing_cards (id, title, price, currency, views, urgent, featured, confidential, published_at, created_at)
      values ('sin_punto','sin coordenadas',100,'PEN',5,false,false,false,'2026-07-11','2026-07-11');
    `);
    expect(await buscar({ ...TRUJILLO, radio: 50 })).not.toContain("sin_punto");
  });
});

describe("search_listings — orden por cercanía", () => {
  it("'distance' ordena del más cercano al más lejano dentro de cada grupo", async () => {
    await db.exec(`delete from public.listing_cards;`);
    // Todos normales, para ver el efecto del orden sin la prioridad de por medio.
    await db.exec(`
      insert into public.listing_cards
        (id, title, price, currency, views, lat, lng, urgent, featured, confidential, published_at, created_at) values
        ('lejos','Trujillo',100,'PEN',5, ${TRUJILLO.lat}, ${TRUJILLO.lng}, false,false,false,'2026-07-10','2026-07-10'),
        ('cerca','Lima',    100,'PEN',5, ${LIMA.lat},     ${LIMA.lng},     false,false,false,'2026-01-01','2026-01-01');
    `);
    // 'cerca' es el más viejo: si mandara la fecha saldría segundo.
    expect(await buscar({ ...LIMA, sort: "distance" })).toEqual(["cerca", "lejos"]);
  });

  it("sin ubicación, pedir 'distance' no rompe: cae al orden por fecha", async () => {
    const orden = await buscar({ sort: "distance" });
    expect(orden).toHaveLength(4);
    expect(orden.slice(0, 2).sort()).toEqual(["lima_urgente", "truj_urgente"]);
  });
});
