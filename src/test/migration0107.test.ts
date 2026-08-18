// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0107: la base rechaza precios negativos y limpia los que hubiera.
 *
 * El cliente ya los impide, pero hay tres vías de escritura sobre esta columna
 * (publicar, editar, panel de administración) y solo el CHECK las cubre todas.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0107_el_precio_no_puede_ser_negativo.sql"),
  "utf8",
);

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.listings (
      id uuid primary key default gen_random_uuid(),
      title text,
      price numeric(12,2) not null default 0
    );
    -- Un aviso con precio negativo, de los que la columna aceptaba hasta hoy.
    insert into public.listings (title, price) values ('roto', -5), ('bueno', 100);
  `);
  await db.exec(MIG);
});

describe("0107 — el precio de un aviso no puede ser negativo", () => {
  it("los negativos que ya existían quedan en 0 (o sea, 'a convenir')", async () => {
    const [r] = await q<{ price: string }>(`select price::text as price from public.listings where title = 'roto'`);
    expect(r.price).toBe("0.00");
  });

  it("no toca los precios buenos", async () => {
    const [r] = await q<{ price: string }>(`select price::text as price from public.listings where title = 'bueno'`);
    expect(r.price).toBe("100.00");
  });

  it("insertar un precio negativo falla", async () => {
    await expect(q(`insert into public.listings (title, price) values ('nuevo', -1)`))
      .rejects.toThrow(/listings_price_no_negativo/);
  });

  it("actualizar a un precio negativo también falla", async () => {
    await expect(q(`update public.listings set price = -0.01 where title = 'bueno'`))
      .rejects.toThrow(/listings_price_no_negativo/);
  });

  it("cero y positivos siguen entrando (0 = precio a convenir)", async () => {
    await q(`insert into public.listings (title, price) values ('gratis', 0)`);
    const [r] = await q<{ n: string }>(`select count(*)::text as n from public.listings where price = 0`);
    expect(Number(r.n)).toBeGreaterThanOrEqual(2);
  });

  it("es re-ejecutable: aplicarla dos veces no falla", async () => {
    await expect(db.exec(MIG)).resolves.toBeDefined();
  });
});
