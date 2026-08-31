// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0136 — el documento de quien reporta (punto B-10).
 *
 * Hay una prueba aquí que vale más que las demás: la de los permisos de
 * `admin_list_reports`. La función CAMBIA DE TIPO DE RETORNO, así que hay que
 * borrarla y recrearla, y eso **pierde los grants**. Desde la 0104 una función
 * nace sin EXECUTE para `authenticated`; olvidarlo deja el panel de denuncias
 * vacío en producción con un 42501 que nadie ve. Ya pasó una vez y dejó el
 * buscador a cero.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0136_documento_de_quien_reporta.sql"),
  "utf8",
);

const STAFF   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VECINO  = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AVISO   = "11111111-1111-4111-8111-111111111111";
const AVISO_2 = "22222222-2222-4222-8222-222222222222";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

interface Fila {
  id: string; reporter_name: string | null; reporter_doc_type: string | null;
  reporter_doc_number: string | null; reporter_doc_verified: boolean | null;
  reportes_del_aviso: string | number | null; listing_id: string | null;
}
const listado = () => q<Fila>("select * from public.admin_list_reports()");

const reportar = (opts: {
  aviso?: string; por?: string; doc?: string | null; verificado?: boolean | null;
  /** `null` = el reporte no trae nombre, como los anteriores a la 0136. */
  nombre?: string | null;
} = {}) => {
  const doc = opts.doc === undefined ? "45678912" : opts.doc;
  return db.exec(`
    insert into public.reports
      (target_type, listing_id, reported_by, reason, category,
       reporter_name, reporter_doc_type, reporter_doc_number, reporter_doc_verified)
    values (
      'listing', '${opts.aviso ?? AVISO}', '${opts.por ?? VECINO}',
      'Posible estafa — se repite el mismo texto', 'Posible estafa o fraude',
      ${opts.nombre === null ? "null" : `'${opts.nombre ?? "ANA RAMIREZ SOTO"}'`},
      ${doc === null ? "null" : "'DNI'"},
      ${doc === null ? "null" : `'${doc}'`},
      ${opts.verificado === undefined ? "true" : opts.verificado === null ? "null" : opts.verificado}
    );
  `);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table public.profiles (id uuid primary key, full_name text);
    create table public.listings (id uuid primary key, owner_id uuid, title text);
    create table public.reports (
      id uuid primary key default gen_random_uuid(),
      target_type text, listing_id uuid, target_user_id uuid,
      reported_by uuid, reason text, category text,
      status text default 'open', action_taken text, assigned_to uuid,
      created_at timestamptz default now()
    );
    create table public.system_settings (key text primary key, value jsonb not null default '{}'::jsonb);
  `);
  // Dobles de lo que la migración da por hecho.
  await db.exec(
    "create function public.is_staff(p_user uuid) returns boolean language sql stable as " +
    `'select $1 = ''${STAFF}''::uuid';`,
  );
  await db.exec(
    "create function public.tope_de_tasa(p_area text, p_ventana text, p_defecto int) " +
    "returns int language sql stable as 'select coalesce((select (value->p_area->>p_ventana)::int " +
    "from public.system_settings where key = ''limites_de_tasa''), p_defecto)';",
  );
  await db.exec("create function public.auth_uid_stub() returns uuid language sql as 'select null::uuid';");
  // `auth.uid()` en PGlite: el listado la usa para comprobar que quien pregunta
  // es personal. Se fija en STAFF para poder leer.
  await db.exec("create schema if not exists auth;");
  await db.exec(`create function auth.uid() returns uuid language sql stable as 'select ''${STAFF}''::uuid';`);
  await db.exec(`
    insert into public.profiles (id, full_name) values
      ('${STAFF}', 'Moderadora'), ('${VECINO}', 'Vecino Anónimo');
    insert into public.listings (id, owner_id, title) values
      ('${AVISO}', '${STAFF}', 'Departamento en Miraflores'),
      ('${AVISO_2}', '${STAFF}', 'Auto seminuevo');
  `);
  // La función anterior, para poder comprobar que la migración la reemplaza.
  await db.exec(`
    create function public.admin_list_reports()
    returns table(id uuid, created_at timestamptz)
    language sql security definer set search_path to 'public' as $$
      select r.id, r.created_at from public.reports r;
    $$;
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec("delete from public.reports; delete from public.system_settings;");
});

describe("el documento de quien reporta", () => {
  it("se guarda y sale en el listado del panel", async () => {
    await reportar();
    const [r] = await listado();
    expect(r.reporter_doc_type).toBe("DNI");
    expect(r.reporter_doc_number).toBe("45678912");
    expect(r.reporter_name).toBe("ANA RAMIREZ SOTO");
    expect(r.reporter_doc_verified).toBe(true);
  });

  it("distingue «no existe» de «no se pudo comprobar»", async () => {
    // Es lo que impide acusar a alguien de documento falso cuando lo que pasó
    // es que Factiliza no respondió.
    await reportar({ verificado: null });
    expect((await listado())[0].reporter_doc_verified).toBeNull();

    await db.exec("delete from public.reports");
    await reportar({ verificado: false });
    expect((await listado())[0].reporter_doc_verified).toBe(false);
  });

  it("los reportes anteriores a esta migración siguen saliendo", async () => {
    // No traen documento, y eso no puede hacer que desaparezcan del panel.
    await reportar({ doc: null, nombre: null });
    const [r] = await listado();
    expect(r.reporter_doc_number).toBeNull();
    // Sin nombre del formulario, cae al del perfil.
    expect(r.reporter_name).toBe("Vecino Anónimo");
  });

  it("el nombre del formulario manda sobre el del perfil", async () => {
    // El del formulario es el que respalda el documento; el del perfil lo
    // escribe cada uno y puede ser un alias.
    await reportar({ nombre: "ANA RAMIREZ SOTO" });
    expect((await listado())[0].reporter_name).toBe("ANA RAMIREZ SOTO");
  });
});

describe("cuántos reportes acumula un aviso", () => {
  it("cuenta los del mismo aviso, no los de la lista entera", async () => {
    await reportar({ aviso: AVISO });
    await reportar({ aviso: AVISO });
    await reportar({ aviso: AVISO_2 });
    const filas = await listado();
    const delPrimero = filas.filter((f) => f.listing_id === AVISO);
    expect(delPrimero).toHaveLength(2);
    expect(delPrimero.every((f) => Number(f.reportes_del_aviso) === 2)).toBe(true);
    expect(Number(filas.find((f) => f.listing_id === AVISO_2)!.reportes_del_aviso)).toBe(1);
  });

  it("un reporte de usuario, sin aviso, no cuenta nada", async () => {
    await db.exec(`
      insert into public.reports (target_type, target_user_id, reported_by, reason, category)
      values ('user', '${STAFF}', '${VECINO}', 'Acoso', 'Comportamiento abusivo');
    `);
    expect((await listado())[0].reportes_del_aviso).toBeNull();
  });
});

describe("los permisos de la función recreada", () => {
  it("authenticated la puede ejecutar", async () => {
    // DROP + CREATE pierde los grants y la 0104 hace que nazca sin ellos. Sin
    // esta línea el panel de denuncias sale vacío en producción, en silencio.
    const p = await q<{ ok: boolean }>(
      "select has_function_privilege('authenticated', 'public.admin_list_reports()', 'execute') as ok",
    );
    expect(p[0].ok).toBe(true);
  });

  it("y PUBLIC no", async () => {
    const p = await q<{ ok: boolean }>(
      "select has_function_privilege('public', 'public.admin_list_reports()', 'execute') as ok",
    );
    expect(p[0].ok).toBe(false);
  });

  it("la migración recrea la función, no la parchea", async () => {
    // Si alguien la cambiara a `create or replace` con un tipo de retorno
    // distinto, Postgres fallaría al aplicarla. Queda escrito.
    expect(MIG).toContain("drop function if exists public.admin_list_reports()");
    expect(MIG).toContain("grant  execute on function public.admin_list_reports() to authenticated");
  });
});

describe("el freno de reportes", () => {
  it("cinco por hora, y el sexto no pasa", async () => {
    // Existe porque desde ahora cada reporte cuesta una consulta que se paga:
    // denunciar en bucle dejó de ser una molestia y pasó a tener factura.
    for (let i = 0; i < 5; i++) await reportar();
    await expect(reportar()).rejects.toThrow(/varios reportes en poco tiempo/i);
  });

  it("el personal queda exento", async () => {
    // Un moderador revisando no es el abuso que esto persigue.
    for (let i = 0; i < 8; i++) await reportar({ por: STAFF });
    await expect(reportar({ por: STAFF })).resolves.toBeDefined();
  });

  it("una persona no bloquea a otra", async () => {
    for (let i = 0; i < 5; i++) await reportar();
    const OTRO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await db.exec(`insert into public.profiles (id, full_name) values ('${OTRO}', 'Otra') on conflict do nothing`);
    await expect(reportar({ por: OTRO })).resolves.toBeDefined();
  });

  it("un tope en 0 lo desactiva, que es la válvula de escape", async () => {
    // Mismo criterio que la 0124: si esto le corta el paso a alguien de verdad,
    // se apaga desde el panel sin desplegar nada.
    await db.exec(
      "insert into public.system_settings (key, value) values " +
      "('limites_de_tasa', '{\"reporte\": {\"hora\": 0, \"dia\": 0}}'::jsonb)",
    );
    for (let i = 0; i < 9; i++) await reportar();
    await expect(reportar()).resolves.toBeDefined();
  });

  it("lo de hace dos horas no cuenta contra el tope de la hora", async () => {
    for (let i = 0; i < 5; i++) await reportar();
    await db.exec("update public.reports set created_at = now() - interval '2 hours'");
    await expect(reportar()).resolves.toBeDefined();
  });
});
