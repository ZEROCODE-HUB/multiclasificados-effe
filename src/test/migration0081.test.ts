// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0081 (fichero REAL, el generado desde el catálogo de zonas)
 * contra un Postgres de verdad.
 *
 * Los avisos publicados antes del selector de zonas tienen la ubicación escrita
 * a mano y muchos sin coordenadas — y sin coordenadas un aviso NO aparece en
 * ninguna búsqueda por cercanía. Esto los cruza contra el catálogo.
 *
 * Lo que más importa comprobar es lo que NO hace: no pisar el punto exacto de
 * quien sí lo marcó, no tocar avisos que no están activos y no adivinar cuando
 * el nombre está repetido en varias regiones.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0081_backfill_listing_coords.sql"),
  "utf8",
);

let db: PGlite;

const filas = async () => {
  const { rows } = await db.query<{ id: string; location: string; lat: number | null; lng: number | null }>(
    `select id, location, lat, lng from public.listings order by id`,
  );
  return rows;
};
const porId = async (id: string) => (await filas()).find((f) => f.id === id)!;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.listings (
      id text primary key,
      location text,
      lat numeric(9,6),
      lng numeric(9,6),
      status text not null default 'active'
    );
  `);
});

describe("0081 — coordenadas a los avisos que no las tienen", () => {
  it("reconoce la etiqueta tal cual y deja el punto de la zona", async () => {
    await db.exec(`insert into public.listings (id, location) values ('a', 'Miraflores, Lima');`);
    await db.exec(MIGRATION);

    const a = await porId("a");
    expect(a.lat).toBeCloseTo(-12.12167, 4);
    expect(a.lng).toBeCloseTo(-77.02917, 4);
    expect(a.location).toBe("Miraflores, Lima");
  });

  it("reconoce el texto escrito al revés, sin tildes o en minúsculas", async () => {
    await db.exec(`
      insert into public.listings (id, location) values
        ('reves', 'Lima, Miraflores'),
        ('minus', 'miraflores, lima'),
        ('sintilde', 'Huanuco'),
        ('espacios', '  Miraflores,   Lima  ');
    `);
    await db.exec(MIGRATION);

    for (const id of ["reves", "minus", "espacios"]) {
      const f = await porId(id);
      expect(f.lat).toBeCloseTo(-12.12167, 4);
      // El texto queda escrito como lo escribe el selector, para que al editar
      // el aviso su zona salga ya elegida.
      expect(f.location).toBe("Miraflores, Lima");
    }
    // Y las tildes se restituyen en el nombre oficial.
    expect((await porId("sintilde")).location).toBe("Huánuco");
    expect((await porId("sintilde")).lat).not.toBeNull();
  });

  it("NO toca el aviso de quien marcó su punto exacto", async () => {
    // Un punto propio dentro de Miraflores, distinto del centro de la zona.
    await db.exec(`
      insert into public.listings (id, location, lat, lng) values
        ('exacto', 'Miraflores, Lima', -12.11000, -77.03500);
    `);
    await db.exec(MIGRATION);

    const f = await porId("exacto");
    expect(f.lat).toBeCloseTo(-12.11, 4);
    expect(f.lng).toBeCloseTo(-77.035, 4);
  });

  it("NO toca los avisos que no están activos", async () => {
    await db.exec(`
      insert into public.listings (id, location, status) values
        ('vencido', 'Miraflores, Lima', 'expired'),
        ('borrador', 'Miraflores, Lima', 'draft');
    `);
    await db.exec(MIGRATION);

    expect((await porId("vencido")).lat).toBeNull();
    expect((await porId("borrador")).lat).toBeNull();
  });

  it("NO adivina cuando el nombre existe en varias regiones", async () => {
    // Hay Bellavista en Callao, San Martín, Piura… elegir uno mandaría el aviso
    // a otra punta del país.
    await db.exec(`insert into public.listings (id, location) values ('ambiguo', 'Bellavista');`);
    await db.exec(MIGRATION);

    const f = await porId("ambiguo");
    expect(f.lat).toBeNull();
    expect(f.location).toBe("Bellavista"); // se deja tal cual para revisarlo
  });

  it("deja en paz lo que no es una zona (servicios en línea, texto suelto)", async () => {
    await db.exec(`
      insert into public.listings (id, location) values
        ('online', 'Online'),
        ('raro', 'A domicilio en todo el país'),
        ('vacio', '');
    `);
    await db.exec(MIGRATION);

    for (const id of ["online", "raro", "vacio"]) {
      expect((await porId(id)).lat).toBeNull();
    }
  });

  it("se puede volver a aplicar sin cambiar nada la segunda vez", async () => {
    await db.exec(`
      insert into public.listings (id, location) values ('a', 'Cusco'), ('b', 'Online');
    `);
    await db.exec(MIGRATION);
    const primera = await filas();
    await db.exec(MIGRATION);
    expect(await filas()).toEqual(primera);
  });

  it("resuelve una provincia de cualquier parte del país, no solo Lima", async () => {
    await db.exec(`
      insert into public.listings (id, location) values
        ('cusco', 'Cusco'), ('arequipa', 'Arequipa'), ('piura', 'Piura');
    `);
    await db.exec(MIGRATION);

    for (const id of ["cusco", "arequipa", "piura"]) {
      const f = await porId(id);
      expect(f.lat).not.toBeNull();
      // Dentro del Perú continental.
      expect(Number(f.lat)).toBeLessThan(0);
      expect(Number(f.lng)).toBeLessThan(-68);
    }
  });
});
