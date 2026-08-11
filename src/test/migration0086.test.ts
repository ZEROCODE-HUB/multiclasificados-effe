// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre las migraciones 0084 → 0086 (ficheros REALES) contra un Postgres de
 * verdad, en el mismo orden en que se aplicarán a producción.
 *
 * Lo que hay en juego: un aviso sin departamento no aparece en NINGÚN filtro de
 * ubicación, y un aviso con el departamento equivocado aparece donde no toca.
 * Las dos cosas son invisibles hasta que alguien se queja de que "no salen
 * anuncios", que es exactamente como se descubrió esto.
 *
 * La 0086 está GENERADA (scripts/generar-backfill-departamentos.mjs), así que la
 * prueba lee el fichero y trabaja con los avisos que realmente lleva dentro: si
 * mañana se regenera con otros, la prueba sigue valiendo.
 */

const leer = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/", f), "utf8");
const M0084 = leer("0084_listing_department.sql");
const M0085 = leer("0085_search_nearest_option.sql");
const M0086 = leer("0086_backfill_listing_department.sql");

/** Los pares (id, departamento) que la 0086 trae escritos. */
const ASIGNACIONES = [...M0086.matchAll(/\('([0-9a-f-]{36})', '(\d{2})'\)/g)]
  .map((m) => ({ id: m[1], dep: m[2] }));

let db: PGlite;
const DUENO = "00000000-0000-0000-0000-0000000000ff";

async function montar() {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create type public.currency as enum ('PEN','USD');

    create table public.profiles (id uuid primary key, full_name text, rating numeric);
    insert into public.profiles values ('${DUENO}', 'Anunciante', 5);

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
}

/** Aplica las tres migraciones en orden, como en producción. */
async function aplicar() {
  await db.exec(M0084);
  await db.exec(M0085);
  await db.exec(M0086);
}

const insertar = (id: string, location: string, status = "active") =>
  db.exec(`insert into public.listings (id, owner_id, title, price, currency, location, status)
           values ('${id}', '${DUENO}', 'Aviso', 100, 'PEN', '${location.replace(/'/g, "''")}', '${status}')`);

const departamentoDe = async (id: string) => {
  const { rows } = await db.query<{ department: string | null }>(
    `select department from public.listings where id = '${id}'`,
  );
  return rows[0]?.department ?? null;
};

const buscar = async (dep: string | null) => {
  const { rows } = await db.query<{ id: string }>(
    `select id from public.search_listings(
       null,null,null,null,null,null,${dep ? `'${dep}'` : "null"},'recent',500,0,null,null)`,
  );
  return rows.map((r) => r.id);
};

beforeEach(montar);

describe("0086 — el fichero generado", () => {
  it("trae avisos que asignar", () => {
    expect(ASIGNACIONES.length).toBeGreaterThan(0);
  });

  it("no repite ningún aviso", () => {
    const ids = ASIGNACIONES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todos los códigos son departamentos que existen en el catálogo", async () => {
    // El catálogo del INEI llega hasta el 25, y el 07 (Callao) va dentro del 15.
    const validos = new Set([
      "01","02","03","04","05","06","08","09","10","11","12","13",
      "14","15","16","17","18","19","20","21","22","23","24","25",
    ]);
    for (const a of ASIGNACIONES) expect(validos).toContain(a.dep);
  });
});

describe("0086 — rellenar el departamento", () => {
  it("le pone su departamento a cada aviso de la lista", async () => {
    for (const a of ASIGNACIONES) await insertar(a.id, "Sin nombre de departamento");
    await aplicar();
    for (const a of ASIGNACIONES) {
      expect(await departamentoDe(a.id)).toBe(a.dep);
    }
  });

  it("después de aplicarla, ningún aviso activo de la lista se queda fuera del filtro", async () => {
    for (const a of ASIGNACIONES) await insertar(a.id, "Chancay");
    await aplicar();
    // Cada aviso tiene que salir al filtrar por SU departamento.
    for (const a of ASIGNACIONES) {
      expect(await buscar(a.dep)).toContain(a.id);
    }
  });

  it("el punto del mapa corrige al texto: 'San Martín de Porres' es de Lima", async () => {
    // Sin la 0086, el relleno por texto de la 0084 lo archivaría en el
    // departamento de San Martín, a 700 km de donde está de verdad.
    const objetivo = ASIGNACIONES.find((a) => a.dep === "15");
    expect(objetivo, "la lista debería incluir algún aviso de Lima").toBeDefined();
    await insertar(objetivo!.id, "San Martín de Porres");

    await db.exec(M0084);
    expect(await departamentoDe(objetivo!.id)).toBe("22"); // el texto se equivoca…
    await db.exec(M0085);
    await db.exec(M0086);
    expect(await departamentoDe(objetivo!.id)).toBe("15"); // …y el punto lo arregla
  });

  it("no toca los avisos que no están en su lista", async () => {
    const ajeno = "aaaaaaaa-0000-0000-0000-000000000001";
    await insertar(ajeno, "Cayma, Arequipa");
    await aplicar();
    expect(await departamentoDe(ajeno)).toBe("04"); // el suyo, por texto
  });

  it("se puede volver a aplicar sin cambiar nada", async () => {
    for (const a of ASIGNACIONES) await insertar(a.id, "Chancay");
    await aplicar();
    const antes = await Promise.all(ASIGNACIONES.map((a) => departamentoDe(a.id)));
    await aplicar();
    const despues = await Promise.all(ASIGNACIONES.map((a) => departamentoDe(a.id)));
    expect(despues).toEqual(antes);
  });

  it("no falla si algún aviso de la lista ya no existe", async () => {
    // Entre generar el fichero y aplicarlo, un anunciante puede borrar su aviso.
    // De los 89 de la lista solo existe uno: las otras 88 filas no encuentran
    // a quién actualizar y eso no puede hacer fallar la migración.
    await insertar(ASIGNACIONES[0].id, "Chancay");
    await aplicar();
    expect(await departamentoDe(ASIGNACIONES[0].id)).toBe(ASIGNACIONES[0].dep);
  });
});

describe("0086 — la queja que la originó", () => {
  it("filtrar por 'Lima y Callao' devuelve los avisos de Lima, no cero", async () => {
    const deLima = ASIGNACIONES.filter((a) => a.dep === "15");
    expect(deLima.length).toBeGreaterThan(0);
    // Con el texto que escribieron de verdad sus dueños: ninguno nombra su
    // departamento, así que sin la 0086 todos estos serían invisibles.
    for (const a of deLima) await insertar(a.id, "Chancay");
    await aplicar();

    const encontrados = await buscar("15");
    for (const a of deLima) expect(encontrados).toContain(a.id);
  });
});
