// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0141 — el texto de «Acerca de Nosotros», editable desde el panel.
 *
 * Lo que de verdad hay que vigilar aquí NO es que devuelva el texto: es QUÉ MÁS
 * podría devolver. `system_settings` guarda también secretos —hay uno,
 * `payment_worker_secret`— y esta función es `security definer` y ejecutable por
 * `anon`, o sea por cualquiera que tenga la clave anónima, que viaja dentro del
 * paquete de la web.
 *
 * Por eso las claves van escritas a mano en el cuerpo de la función y no se
 * generaliza a un `get_public_setting(key)`, que sería mucho más cómodo y
 * abriría la caja entera. Es el mismo criterio de la 0134 (redes sociales), y
 * aquí se comprueba que se mantiene.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0141_acerca_de_nosotros.sql"),
  "utf8",
);

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const acerca = async (): Promise<Record<string, string>> =>
  (await q<{ j: Record<string, string> }>("select public.acerca_de() as j"))[0].j;

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table public.system_settings (
      key text primary key, value jsonb, label text, updated_at timestamptz default now()
    );
  `);
  await db.exec(MIG);
});

describe("devuelve el texto y solo el texto", () => {
  it("las cuatro claves, sin el prefijo `about_`", async () => {
    // Quien la consume pide `titulo`, no `about_titulo`.
    const j = await acerca();
    expect(Object.keys(j).sort()).toEqual(["mision", "texto", "titulo", "vision"]);
  });

  it("como texto plano, no entrecomillado", async () => {
    // Se guarda como jsonb string. Sin el `#>> '{}'` llegaría con las comillas
    // dentro y se pintarían en la portada.
    const j = await acerca();
    expect(j.titulo).toBe("Acerca de Nosotros");
    expect(j.titulo.startsWith('"')).toBe(false);
  });

  it("respeta los saltos de línea del texto largo", async () => {
    // El front lo pinta con `whitespace-pre-line`: si los saltos se perdieran
    // aquí, los párrafos se pegarían en uno solo.
    expect((await acerca()).texto).toContain("\n\n");
  });
});

describe("y NO devuelve nada más de system_settings", () => {
  it("un secreto guardado en la misma tabla no sale", async () => {
    // La razón entera de que las claves estén escritas a mano en la función.
    await db.exec(`
      insert into public.system_settings (key, value, label)
      values ('payment_worker_secret', '"no-me-publiques"'::jsonb, 'Secreto')
      on conflict (key) do nothing;
    `);
    const j = await acerca();
    expect(JSON.stringify(j)).not.toContain("no-me-publiques");
    expect(j).not.toHaveProperty("payment_worker_secret");
  });

  it("la función no se generalizó a una que acepte cualquier clave", () => {
    // Una `get_public_setting(key)` sería más cómoda y dejaría la tabla entera
    // al alcance de la clave anónima.
    expect(MIG).toContain("'about_titulo'");
    expect(MIG).toContain("'about_texto'");
    expect(MIG).not.toMatch(/create .*function public\.get_public_setting/i);
  });
});

describe("quién puede llamarla", () => {
  it("`anon` sí: la portada la ve todo el mundo, con sesión y sin ella", async () => {
    // Desde la 0104 una función nueva nace SIN execute. Sin el grant explícito
    // la sección sale vacía y sin decir por qué: un 42501 que el `catch` del
    // front se traga. Ya pasó una vez y dejó el buscador a cero.
    const [{ ok }] = await q<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.acerca_de()', 'execute') as ok",
    );
    expect(ok).toBe(true);
  });

  it("y quien tiene sesión, también", async () => {
    const [{ ok }] = await q<{ ok: boolean }>(
      "select has_function_privilege('authenticated', 'public.acerca_de()', 'execute') as ok",
    );
    expect(ok).toBe(true);
  });
});

describe("nace con texto, no en blanco", () => {
  it("las cuatro filas existen con su etiqueta para el panel", async () => {
    // Sin las filas, el administrador no tiene dónde escribirlas: la pantalla
    // del panel lee lo que hay en la tabla.
    const filas = await q<{ key: string; label: string }>(
      "select key, label from public.system_settings where key like 'about_%' order by key",
    );
    expect(filas).toHaveLength(4);
    expect(filas.every((f) => !!f.label)).toBe(true);
  });

  it("y volver a aplicar la migración NO pisa lo que ya se escribió", async () => {
    // `on conflict do nothing`. Sin esto, cada despliegue borraría el texto del
    // cliente y devolvería el de fábrica.
    await db.exec(`update public.system_settings set value = '"Nuestra empresa"'::jsonb where key = 'about_titulo';`);
    await db.exec(MIG);
    expect((await acerca()).titulo).toBe("Nuestra empresa");
  });
});
