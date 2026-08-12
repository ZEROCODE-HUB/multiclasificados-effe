// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0092 — se elimina `spend_credits`.
 *
 * La 0091 le revocó el EXECUTE a `authenticated`, pero un revoke no es una
 * protección estable: una migración futura que haga DROP + CREATE (no
 * `create or replace`, que sí conserva permisos) devuelve el EXECUTE que
 * Postgres concede a PUBLIC por defecto, y el agujero vuelve sin que nadie lo
 * note. Es literalmente lo que le pasó a `settle_paid_order` entre la 0061 y la
 * 0090.
 *
 * La función ya no tiene llamadores, así que en vez de custodiar un permiso se
 * quita la función: lo que no existe no se puede volver a exponer por descuido.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0092 = read("0092_drop_spend_credits.sql");

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

const existe = async () => {
  const [r] = await q<{ n: number }>(`
    select count(*)::int as n from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'spend_credits'`);
  return r.n > 0;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create function public.spend_credits(p_user_id uuid, p_credits numeric, p_listing_id uuid default null, p_description text default null)
      returns boolean language sql as $$ select true $$;
  `);
});

describe("0092 — spend_credits deja de existir", () => {
  it("estaba, y después de la migración ya no", async () => {
    expect(await existe()).toBe(true);
    await db.exec(MIG_0092);
    expect(await existe()).toBe(false);
  });

  it("llamarla es un error de función inexistente, no de permisos", async () => {
    // La diferencia importa: "permission denied" depende de un grant que una
    // migración futura puede deshacer sin querer; "no existe" no depende de nada.
    await db.exec(`set role authenticated;`);
    await expect(
      q(`select public.spend_credits('00000000-0000-0000-0000-000000000001'::uuid, 1, null, 'x')`),
    ).rejects.toThrow(/does not exist/i);
    await db.exec(`reset role;`);
  });

  it("se puede aplicar dos veces sin romper nada", async () => {
    // Las migraciones se reaplican en entornos nuevos; `if exists` lo permite.
    await db.exec(MIG_0092);
    expect(await existe()).toBe(false);
  });
});
