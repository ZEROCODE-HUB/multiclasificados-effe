// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0139 — el KPI de denuncias, separado por tipo.
 *
 * `reports` guarda dos cosas que no se moderan igual ni las mira la misma
 * persona: las de avisos se resuelven en Gestión de avisos → Reportados y las de
 * usuarios en Usuarios reportados. Un solo "Recibidas: 42" no dice si el
 * problema es lo que se publica o cómo se comporta la gente.
 *
 * Lo que más importa aquí: **los totales de primer nivel siguen estando**. Si el
 * navegador tiene la versión anterior en caché cuando esto se aplique, la
 * pantalla tiene que seguir funcionando en vez de enseñar ceros.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0139_denuncias_por_tipo.sql"),
  "utf8",
);

const STAFF  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VECINO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

interface Cifras { recibidos: number; pendientes: number; solucionados: number }
interface Resumen extends Cifras {
  avisos: Cifras; usuarios: Cifras;
  trend: { mes: string; recibidos: number; solucionados: number }[];
}
const resumen = async (args = "") =>
  (await q<{ j: Resumen }>(`select public.admin_claims_summary(${args}) as j`))[0].j;

/** Inserta una denuncia. `tipo` decide si es de aviso o de usuario. */
const denunciar = (tipo: "listing" | "user", status: string, cuando = "now()") =>
  db.exec(`
    insert into public.reports (target_type, ${tipo === "listing" ? "listing_id" : "target_user_id"},
                                reported_by, reason, status, created_at, resolved_at)
    values ('${tipo}', gen_random_uuid(), '${VECINO}', 'Motivo', '${status}', ${cuando},
            ${status === "resolved" ? cuando : "null"});
  `);

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;");
  await db.exec(`
    create table public.reports (
      id uuid primary key default gen_random_uuid(),
      target_type text, listing_id uuid, target_user_id uuid,
      reported_by uuid, reason text, status text default 'open',
      created_at timestamptz default now(), resolved_at timestamptz
    );
  `);
  await db.exec("create schema if not exists auth;");
  await db.exec(`create function auth.uid() returns uuid language sql stable as 'select ''${STAFF}''::uuid';`);
  // `coalesce(..., false)` porque el `is_staff` real devuelve FALSE con un
  // usuario nulo, no NULL (comprobado contra producción el 1-sep-2026). Importa:
  // con NULL, `not is_staff(...)` sería NULL, el `case` se iría al ELSE y la
  // función le daría las cifras a quien no tiene sesión. Un doble que devolviera
  // NULL haría fallar esta prueba por un motivo que no existe en producción.
  await db.exec(
    "create function public.is_staff(p_user uuid) returns boolean language sql stable as " +
    `'select coalesce($1 = ''${STAFF}''::uuid, false)';`,
  );
  await db.exec(MIG);
});

beforeEach(() => db.exec("delete from public.reports"));

describe("el desglose por tipo", () => {
  it("cuenta los avisos y los usuarios por separado", async () => {
    await denunciar("listing", "open");
    await denunciar("listing", "reviewing");
    await denunciar("listing", "resolved");
    await denunciar("user", "open");
    await denunciar("user", "open");

    const r = await resumen();
    expect(r.avisos).toEqual({ recibidos: 3, pendientes: 2, solucionados: 1 });
    expect(r.usuarios).toEqual({ recibidos: 2, pendientes: 2, solucionados: 0 });
  });

  it("«en revisión» cuenta como pendiente, no como resuelta", async () => {
    // Sigue esperando a alguien: meterla en «resueltas» diría que ya se hizo.
    await denunciar("user", "reviewing");
    const r = await resumen();
    expect(r.usuarios.pendientes).toBe(1);
    expect(r.usuarios.solucionados).toBe(0);
  });

  it("sin denuncias de un tipo, ese grupo va a cero y no falta", async () => {
    // Que el objeto exista aunque esté vacío: la pantalla lee `claims.avisos` y
    // un `undefined` la haría esconder la tarjeta como si no supiéramos nada.
    await denunciar("user", "open");
    const r = await resumen();
    expect(r.avisos).toEqual({ recibidos: 0, pendientes: 0, solucionados: 0 });
  });
});

describe("los totales de siempre", () => {
  it("siguen ahí, y son la suma de los dos grupos", async () => {
    // Es lo que evita que un navegador con la versión anterior en caché enseñe
    // ceros el día que esto se aplique.
    await denunciar("listing", "open");
    await denunciar("listing", "resolved");
    await denunciar("user", "reviewing");

    const r = await resumen();
    expect(r.recibidos).toBe(3);
    expect(r.pendientes).toBe(2);
    expect(r.solucionados).toBe(1);
    expect(r.avisos.recibidos + r.usuarios.recibidos).toBe(r.recibidos);
    expect(r.avisos.pendientes + r.usuarios.pendientes).toBe(r.pendientes);
    expect(r.avisos.solucionados + r.usuarios.solucionados).toBe(r.solucionados);
  });

  it("la tendencia sigue viniendo, con sus seis meses", async () => {
    await denunciar("listing", "open");
    const r = await resumen();
    expect(Array.isArray(r.trend)).toBe(true);
    expect(r.trend).toHaveLength(6);
  });
});

describe("el rango de fechas", () => {
  it("filtra el desglose, no solo el total", async () => {
    // Era fácil equivocarse: si el desglose contara la tabla entera, cambiar las
    // fechas movería el total y dejaría las dos tarjetas quietas.
    await denunciar("listing", "open", "'2026-01-15'::timestamptz");
    await denunciar("user", "open", "'2026-08-20'::timestamptz");

    const r = await resumen("'2026-08-01'::date, '2026-08-31'::date");
    expect(r.recibidos).toBe(1);
    expect(r.avisos.recibidos).toBe(0);
    expect(r.usuarios.recibidos).toBe(1);
  });

  it("el día final entra entero, no se corta a medianoche", async () => {
    await denunciar("user", "open", "'2026-08-31 23:30'::timestamptz");
    const r = await resumen("'2026-08-01'::date, '2026-08-31'::date");
    expect(r.usuarios.recibidos).toBe(1);
  });
});

describe("quién puede llamarla", () => {
  it("quien no es personal no recibe cifras", async () => {
    await denunciar("user", "open");
    await db.exec("create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';");
    const [{ j }] = await q<{ j: Record<string, unknown> }>("select public.admin_claims_summary() as j");
    expect(j).toEqual({});
    await db.exec(`create or replace function auth.uid() returns uuid language sql stable as 'select ''${STAFF}''::uuid';`);
  });

  it("y deja de estar al alcance de la llave anónima", async () => {
    // Tenía EXECUTE para PUBLIC. No filtraba nada —la guarda `is_staff` devuelve
    // '{}'— pero un KPI del panel no tiene por qué responderle a nadie sin sesión.
    const p = await q<{ ok: boolean }>(
      "select has_function_privilege('anon', 'public.admin_claims_summary(date,date)', 'execute') as ok",
    );
    expect(p[0].ok).toBe(false);
    const a = await q<{ ok: boolean }>(
      "select has_function_privilege('authenticated', 'public.admin_claims_summary(date,date)', 'execute') as ok",
    );
    expect(a[0].ok).toBe(true);
  });
});
