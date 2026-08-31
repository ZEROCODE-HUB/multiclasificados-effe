// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0134 — los enlaces de redes del pie, legibles sin sesión.
 *
 * Dos cosas que comprobar, y la segunda es la que importa:
 *
 * 1. Que devuelva lo que hay configurado.
 * 2. Que **no devuelva nada más**. `system_settings` guarda también
 *    `payment_worker_secret`; una función pública que leyera esa tabla sin
 *    filtro dejaría el secreto al alcance de cualquiera con la anon key, que va
 *    escrita en el bundle. Por eso la lista de claves está a mano en el SQL, y
 *    por eso hay una prueba que se rompe si alguien la generaliza.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0134_redes_sociales.sql"),
  "utf8",
);

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

const redes = () =>
  q<{ redes_sociales: Record<string, string | null> }>("select public.redes_sociales()")
    .then((r) => r[0].redes_sociales);

const poner = (key: string, valor: string) =>
  db.exec(
    `insert into public.system_settings (key, value) values ('${key}', to_jsonb('${valor}'::text))
     on conflict (key) do update set value = excluded.value;`,
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table public.system_settings (
      key text primary key,
      value jsonb not null default '{}'::jsonb,
      label text,
      updated_at timestamptz not null default now()
    );
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec("delete from public.system_settings;");
  // La migración crea las seis filas vacías; se rehacen en cada prueba para
  // partir siempre del mismo estado.
  await db.exec(MIG);
});

describe("lo que devuelve", () => {
  it("las seis filas nacen vacías, para que el panel tenga dónde escribir", async () => {
    const filas = await q<{ key: string }>(
      "select key from public.system_settings where key like 'social_%' order by key",
    );
    expect(filas.map((f) => f.key)).toEqual([
      "social_facebook", "social_instagram", "social_linkedin",
      "social_tiktok", "social_whatsapp", "social_youtube",
    ]);
  });

  it("un enlace configurado sale, y sin el prefijo social_", async () => {
    await poner("social_facebook", "https://facebook.com/coleffe");
    const r = await redes();
    expect(r.facebook).toBe("https://facebook.com/coleffe");
    expect(r).not.toHaveProperty("social_facebook");
  });

  it("una red vacía viaja como null, no como cadena vacía", async () => {
    // Así el front distingue "no configurada" sin tener que adivinar.
    const r = await redes();
    expect(r.facebook).toBeNull();
  });

  it("los espacios sobrantes se recortan en la base", async () => {
    await poner("social_youtube", "  https://youtube.com/@coleffe  ");
    expect((await redes()).youtube).toBe("https://youtube.com/@coleffe");
  });
});

describe("lo que NO devuelve", () => {
  it("un secreto guardado en la misma tabla no se filtra", async () => {
    // Esta es la prueba que impide generalizar la función a
    // `get_public_setting(key)`. Si alguien lo hace, esto se pone en rojo.
    await poner("payment_worker_secret", "no-debe-salir-jamas");
    await poner("social_facebook", "https://facebook.com/coleffe");
    const r = await redes();
    expect(JSON.stringify(r)).not.toContain("no-debe-salir-jamas");
    expect(Object.keys(r).sort()).toEqual([
      "facebook", "instagram", "linkedin", "tiktok", "whatsapp", "youtube",
    ]);
  });

  it("sin ninguna fila devuelve un objeto vacío, no nulo", async () => {
    // Un null obligaría a comprobarlo en cada sitio que la use.
    await db.exec("delete from public.system_settings;");
    expect(await redes()).toEqual({});
  });
});

describe("quién puede llamarla", () => {
  it("anon y authenticated, que el pie lo ve todo el mundo", async () => {
    // La 0104 hace que una función nueva nazca SIN execute. Sin el grant el pie
    // sale sin iconos y sin decir por qué: un 42501 que el catch se traga.
    const permisos = await q<{ anon: boolean; auth: boolean }>(`
      select has_function_privilege('anon', 'public.redes_sociales()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.redes_sociales()', 'execute') as auth
    `);
    expect(permisos[0].anon).toBe(true);
    expect(permisos[0].auth).toBe(true);
  });

  it("y PUBLIC no la tiene por defecto", async () => {
    const r = await q<{ ok: boolean }>(
      "select has_function_privilege('public', 'public.redes_sociales()', 'execute') as ok",
    );
    expect(r[0].ok).toBe(false);
  });
});

describe("se puede volver a aplicar", () => {
  it("dos pasadas no borran lo ya configurado", async () => {
    // Es lo que evita que un despliegue deje el pie sin enlaces.
    await poner("social_instagram", "https://instagram.com/coleffe");
    await db.exec(MIG);
    expect((await redes()).instagram).toBe("https://instagram.com/coleffe");
  });
});
