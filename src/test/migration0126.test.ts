// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0126 — B-08: un reclamo nuevo también avisa por la campana.
 *
 * Antes solo salía un correo interno. Un correo entre otros cincuenta se pierde,
 * y este no es uno cualquiera: el Reglamento del Libro de Reclamaciones da
 * TREINTA DÍAS para responder, y el plazo corre desde que el consumidor lo
 * registra, no desde que alguien lo lee.
 *
 * Lo que más importa fijar aquí es lo de abajo del todo: que un fallo avisando
 * NUNCA tumbe el registro del reclamo. La constancia es lo que exige la ley; la
 * campana es comodidad nuestra.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0126_aviso_de_reclamo_en_la_campana.sql"),
  "utf8",
);

const ADMIN = "11111111-1111-4111-8111-111111111111";
const SUPER = "22222222-2222-4222-8222-222222222222";
const USUARIO = "33333333-3333-4333-8333-333333333333";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

const avisos = () =>
  q<{ user_id: string; event: string; title: string; payload: Record<string, unknown> }>(
    `select user_id, event, title, payload from public.avisados order by user_id`,
  );

const reclamar = (kind = "reclamo", nombre = "Ana Quispe", code: number | null = 42) =>
  db.exec(`insert into public.complaints (kind, full_name, code)
           values ('${kind}', ${nombre === null ? "null" : `'${nombre}'`}, ${code ?? "null"});`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role service_role;

    create table public.complaints (
      id uuid primary key default gen_random_uuid(),
      kind text not null,
      full_name text,
      code bigint
    );
    create table public.user_roles (user_id uuid, role text);
    insert into public.user_roles values
      ('${ADMIN}', 'admin'), ('${SUPER}', 'superadmin'), ('${USUARIO}', 'anunciante');

    -- Espía de notify_user: lo que se prueba es A QUIÉN se avisa y CON QUÉ.
    create table public.avisados (user_id uuid, event text, title text, payload jsonb);
    create function public.notify_user(p_user uuid, p_event text, p_title text, p_payload jsonb)
      returns void language sql as $$
        insert into public.avisados values (p_user, p_event, p_title, p_payload)
      $$;
  `);
  await db.exec(MIG);
});

beforeEach(() => db.exec(`delete from public.avisados; delete from public.complaints;`));

describe("a quién se avisa", () => {
  it("a administración, y solo a ella", async () => {
    await reclamar();
    const a = await avisos();
    expect(a.map((x) => x.user_id).sort()).toEqual([ADMIN, SUPER].sort());
  });

  it("nunca a un anunciante: no es asunto suyo", async () => {
    await reclamar();
    expect((await avisos()).some((x) => x.user_id === USUARIO)).toBe(false);
  });
});

describe("qué dice el aviso", () => {
  it("lleva el código y el nombre: no hay pantalla a la que enlazar", async () => {
    // La del Libro de Reclamaciones no existe (B-09, aparcado), así que el aviso
    // tiene que bastarse solo para poder buscar el correo o llamar.
    await reclamar("reclamo", "Ana Quispe", 42);
    const p = (await avisos())[0].payload;
    expect(String(p.resumen)).toContain("42");
    expect(String(p.resumen)).toContain("Ana Quispe");
  });

  it("distingue RECLAMO de QUEJA, que ante Indecopi no son lo mismo", async () => {
    await reclamar("queja", "Beto Ríos", 7);
    const a = (await avisos())[0];
    expect(a.title.toLowerCase()).toContain("queja");
    expect(String(a.payload.resumen)).toContain("Queja");
  });

  it("un reclamo sin nombre no rompe el texto", async () => {
    await reclamar("reclamo", null, 9);
    expect(String((await avisos())[0].payload.resumen)).toContain("un consumidor");
  });

  it("y sin código tampoco", async () => {
    await reclamar("reclamo", "Ana", null);
    expect((await avisos())[0].payload.resumen).toBeTruthy();
  });
});

describe("el reclamo SIEMPRE queda registrado", () => {
  it("aunque avisar falle: la constancia es lo que exige la ley", async () => {
    // La campana es comodidad nuestra. Si esto abortara el INSERT, el
    // consumidor se quedaría sin registro y sin plazo corriendo a su favor.
    await db.exec(`
      drop function public.notify_user(uuid, text, text, jsonb);
      create function public.notify_user(p_user uuid, p_event text, p_title text, p_payload jsonb)
        returns void language plpgsql as $$ begin raise exception 'boom'; end $$;
    `);
    await reclamar();
    expect((await q<{ n: number }>(`select count(*)::int as n from public.complaints`))[0].n).toBe(1);
  });
});
