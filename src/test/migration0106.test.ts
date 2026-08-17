// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0106 — el registro de consultas a Factiliza.
 *
 * Es a la vez el contador del tope y la caché. Lo que se garantiza aquí:
 *
 *  1. Que nadie puede leerla desde el navegador: lleva nombre y domicilio de
 *     cualquier DNI consultado, y son datos de terceros.
 *  2. Que la purga olvida esos datos en cuanto dejan de valer como caché, pero
 *     conserva la fila el tiempo que puede influir en un tope.
 *  3. Que la función de purga no queda abierta a `anon`/`authenticated`, que es
 *     el descuido que hubo que cerrar en la 0103/0104.
 */

const leer = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/", f), "utf8");

const SQL = leer("0106_menos_consultas_a_factiliza.sql");

let db: PGlite;

beforeEach(async () => {
  db = new PGlite();
  // Lo mínimo del entorno de Supabase que la migración necesita.
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create role anon; create role authenticated; create role service_role;
  `);
  await db.exec(SQL);
});

const nuevoUsuario = async (): Promise<string> => {
  const r = await db.query<{ id: string }>("insert into auth.users default values returning id");
  return r.rows[0].id;
};

const anotar = async (user: string, opts: Partial<{ tipo: string; numero: string; ok: boolean; hace: string }> = {}) => {
  await db.query(
    `insert into public.doc_lookups (user_id, doc_type, doc_number, ok, nombre, data, created_at)
     values ($1, $2, $3, $4, 'JUAN PEREZ', '{"direccion":"AV. LIMA 123"}'::jsonb, now() - $5::interval)`,
    [user, opts.tipo ?? "dni", opts.numero ?? "44443333", opts.ok ?? true, opts.hace ?? "0 days"],
  );
};

describe("0106 — consultas de documento", () => {
  it("la tabla existe con RLS activada y SIN políticas", async () => {
    const r = await db.query<{ relrowsecurity: boolean; n: number }>(`
      select c.relrowsecurity,
             (select count(*) from pg_policies p
               where p.schemaname = 'public' and p.tablename = 'doc_lookups')::int as n
        from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relname = 'doc_lookups'
    `);
    expect(r.rows[0].relrowsecurity).toBe(true);
    // Sin políticas: nadie llega a estos datos salvo service_role.
    expect(r.rows[0].n).toBe(0);
  });

  it("solo acepta dni o ruc", async () => {
    const u = await nuevoUsuario();
    await expect(anotar(u, { tipo: "pasaporte" })).rejects.toThrow();
  });

  it("borrar la cuenta se lleva sus consultas", async () => {
    const u = await nuevoUsuario();
    await anotar(u);
    await db.query("delete from auth.users where id = $1", [u]);
    const r = await db.query<{ n: number }>("select count(*)::int as n from public.doc_lookups");
    expect(r.rows[0].n).toBe(0);
  });

  it("la purga olvida los datos personales pero conserva la fila para el tope", async () => {
    const u = await nuevoUsuario();
    await anotar(u, { hace: "40 days" });   // ya no vale como caché
    await anotar(u, { hace: "2 days" });    // aún vale

    await db.query("select public.purge_doc_lookups(30)");

    const r = await db.query<{ nombre: string | null; dias: number }>(`
      select nombre, extract(day from now() - created_at)::int as dias
        from public.doc_lookups order by created_at
    `);
    expect(r.rows.length).toBe(2);            // las dos siguen contando
    expect(r.rows[0].nombre).toBeNull();      // la vieja, sin datos personales
    expect(r.rows[1].nombre).toBe("JUAN PEREZ");
  });

  it("lo verdaderamente antiguo se borra entero", async () => {
    const u = await nuevoUsuario();
    await anotar(u, { hace: "90 days" });
    const r = await db.query<{ purge_doc_lookups: number }>("select public.purge_doc_lookups(30)");
    expect(r.rows[0].purge_doc_lookups).toBe(1);
    const q = await db.query<{ n: number }>("select count(*)::int as n from public.doc_lookups");
    expect(q.rows[0].n).toBe(0);
  });

  it("la purga no la puede llamar el cliente", async () => {
    // El descuido de la 0103: una función SECURITY DEFINER con el EXECUTE que
    // Postgres concede a PUBLIC por defecto queda publicada como endpoint REST.
    for (const rol of ["anon", "authenticated", "public"]) {
      const r = await db.query<{ puede: boolean }>(
        "select has_function_privilege($1, 'public.purge_doc_lookups(int)', 'execute') as puede",
        [rol],
      );
      expect(r.rows[0].puede).toBe(false);
    }
    const s = await db.query<{ puede: boolean }>(
      "select has_function_privilege('service_role', 'public.purge_doc_lookups(int)', 'execute') as puede",
    );
    expect(s.rows[0].puede).toBe(true);
  });

  it("aplicarla dos veces no rompe nada", async () => {
    await expect(db.exec(SQL)).resolves.toBeDefined();
  });
});
