// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0144 — darse de baja no borra a quien contrató.
 *
 * LO QUE REPORTÓ EL CLIENTE: "con el rol de usuario final he ELIMINADO una
 * cuenta, y al parecer lo hizo totalmente, no lo encuentro como INACTIVO, y
 * todos los avisos relacionados con ese cliente ya no son parte de las
 * estadísticas del Dashboard, ni en cantidad de avisos, tampoco en dinero que
 * ingresó. Tenía avisos activos, vencidos y un historial que no se debe perder."
 *
 * La regla —a quien ya contrató NO se le borra, porque sus boletas están
 * declaradas ante SUNAT— se puso en la 0127, pero SOLO en el botón del panel.
 * `delete_my_account`, que es la de la 0053 y la que está abierta al público,
 * siguió haciendo un `delete from auth.users` a secas.
 *
 * Lo que más duele está en la cascada: `invoices.order_id` es CASCADE, así que
 * al irse las órdenes se van los comprobantes. Por eso esta prueba comprueba las
 * BOLETAS y no solo el perfil: es el dato que no se puede reconstruir.
 */
const MIG_0127 = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0127_no_borrar_a_quien_contrato.sql"),
  "utf8",
);
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0144_darse_de_baja_no_borra_al_que_contrato.sql"),
  "utf8",
);

const CLIENTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CURIOSO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const num = async (sql: string) =>
  Number((await q<{ v: string }>(`select (${sql})::text as v`))[0].v);

const comoSiFuera = async (uid: string | null) => {
  await db.exec(
    `create or replace function auth.uid() returns uuid language sql stable as ` +
    `'select ${uid === null ? "null::uuid" : `''${uid}''::uuid`}';`,
  );
};

const darseDeBaja = () =>
  q<{ accion: string }>("select (public.delete_my_account()->>'accion') as accion")
    .then((r) => r[0].accion);

const cuantos = (tabla: string, donde: string) =>
  num(`select count(*) from public.${tabla} where ${donde}`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    create table auth.sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade
    );

    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      email text, status text default 'active',
      updated_at timestamptz default now(), created_at timestamptz default now()
    );
    create table public.orders (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.profiles(id) on delete cascade,
      total numeric, status text, payment_provider text, payment_ref text,
      paid_at timestamptz, created_at timestamptz default now()
    );
    -- La cascada que se lleva los comprobantes por delante. Está copiada de
    -- producción a propósito: si se relajara aquí, la prueba dejaría de vigilar
    -- lo único que de verdad no se puede recuperar.
    create table public.invoices (
      id uuid primary key default gen_random_uuid(),
      order_id uuid references public.orders(id) on delete cascade,
      number text, email text, amount numeric, sunat_status text
    );
    create table public.listings (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references public.profiles(id) on delete cascade,
      status text, title text
    );
    create table public.audit_logs (
      id uuid primary key default gen_random_uuid(),
      actor_id uuid references public.profiles(id) on delete set null,
      action text, entity_type text, entity_id text,
      metadata jsonb, created_at timestamptz default now()
    );
    create table public.pricing_settings (id int primary key, updated_by uuid);

    create function public.has_role(p_user uuid, p_role text) returns boolean
      language sql stable as 'select true';
    create function public.log_audit(p_a text, p_b text, p_c text, p_d jsonb)
      returns void language sql as 'select null::void';
  `);
  await comoSiFuera(CLIENTE);
  // La 0127 trae `tiene_rastro_comercial`, que es la que la 0144 reutiliza.
  // Se ejecuta solo ese trozo: el resto toca tablas que aquí no hacen falta.
  const trozo = MIG_0127.slice(
    MIG_0127.indexOf("create or replace function public.tiene_rastro_comercial"),
    MIG_0127.indexOf("-- ---------- 3."),
  );
  await db.exec(trozo);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec(`
    delete from public.audit_logs;
    delete from public.invoices;
    delete from public.orders;
    delete from public.listings;
    delete from public.profiles;
    delete from auth.users;
    insert into auth.users (id) values ('${CLIENTE}'), ('${CURIOSO}');
    insert into public.profiles (id, email) values
      ('${CLIENTE}', 'cliente@correo.com'), ('${CURIOSO}', 'curioso@correo.com');
  `);
  await comoSiFuera(CLIENTE);
});

/** Un cliente con lo que describió el reporte: avisos activos, vencidos y boleta. */
const conHistorial = () => db.exec(`
  insert into public.listings (owner_id, status, title) values
    ('${CLIENTE}', 'active',  'Aviso vivo'),
    ('${CLIENTE}', 'active',  'Otro vivo'),
    ('${CLIENTE}', 'expired', 'Aviso vencido');
  insert into public.orders (id, user_id, total, status, payment_provider, payment_ref, paid_at)
    values ('11111111-1111-4111-8111-111111111111', '${CLIENTE}', 120, 'paid', 'izipay', 'REF-1', now());
  insert into public.invoices (order_id, number, email, amount, sunat_status)
    values ('11111111-1111-4111-8111-111111111111', 'B066-000060', 'cliente@correo.com', 120, 'aceptado');
`);

describe("quien contrató NO se borra", () => {
  it("se da de baja, no se elimina", async () => {
    await conHistorial();
    expect(await darseDeBaja()).toBe("desactivado");

    expect(await cuantos("profiles", `id = '${CLIENTE}'`)).toBe(1);
    const [{ estado }] = await q<{ estado: string }>(
      `select status as estado from public.profiles where id = '${CLIENTE}'`,
    );
    expect(estado).toBe("inactive");
  });

  it("LAS BOLETAS SIGUEN AHÍ", async () => {
    // Es lo único de todo esto que no se puede reconstruir: el comprobante ya
    // está declarado ante SUNAT y conservarlo es obligación nuestra, se vaya el
    // cliente o no. `invoices` cuelga de `orders` en CASCADE, así que borrar al
    // usuario las arrastraba.
    await conHistorial();
    await darseDeBaja();
    expect(await cuantos("invoices", "true")).toBe(1);
    expect(await cuantos("orders", `user_id = '${CLIENTE}'`)).toBe(1);
  });

  it("los avisos se conservan, y los vivos quedan pausados", async () => {
    // Se conservan porque el cliente pide que el historial no se pierda; se
    // pausan porque un aviso de alguien que se fue no lo va a atender nadie.
    await conHistorial();
    await darseDeBaja();
    expect(await cuantos("listings", `owner_id = '${CLIENTE}'`)).toBe(3);
    expect(await cuantos("listings", `owner_id = '${CLIENTE}' and status = 'active'`)).toBe(0);
    expect(await cuantos("listings", `owner_id = '${CLIENTE}' and status = 'paused'`)).toBe(2);
    // El vencido se queda como estaba: pausarlo borraría que llegó a caducar.
    expect(await cuantos("listings", `owner_id = '${CLIENTE}' and status = 'expired'`)).toBe(1);
  });

  it("basta con haber comprado, aunque nunca publicara", async () => {
    // El caso que la 0127 ya contemplaba: hay una boleta a su nombre y borrarlo
    // dejaría un comprobante sin cliente.
    await db.exec(`
      insert into public.orders (user_id, total, status, payment_provider, payment_ref, paid_at)
      values ('${CLIENTE}', 50, 'paid', 'yape', 'REF-2', now());
    `);
    expect(await darseDeBaja()).toBe("desactivado");
  });

  it("y se le cierran TODAS las sesiones, no solo la del navegador que pulsó", async () => {
    // La cuenta sigue existiendo en `auth.users`: un token vivo en el móvil
    // seguiría sirviendo hasta caducar.
    await conHistorial();
    await db.exec(`insert into auth.sessions (user_id) values ('${CLIENTE}'), ('${CLIENTE}');`);
    await darseDeBaja();
    expect(await num(`select count(*) from auth.sessions where user_id = '${CLIENTE}'`)).toBe(0);
  });
});

describe("quien nunca contrató sí se borra", () => {
  it("se elimina de verdad: guardar cuentas vacías no protege de nada", async () => {
    expect(await darseDeBaja()).toBe("eliminado");
    expect(await cuantos("profiles", `id = '${CLIENTE}'`)).toBe(0);
    expect(await num(`select count(*) from auth.users where id = '${CLIENTE}'`)).toBe(0);
  });

  it("no se lleva por delante a nadie más", async () => {
    await darseDeBaja();
    expect(await cuantos("profiles", `id = '${CURIOSO}'`)).toBe(1);
  });
});

describe("queda rastro de lo que pasó", () => {
  /**
   * Al investigar el caso real no hubo forma de saber cuándo se borró la cuenta
   * ni por qué camino: `delete_my_account` no escribía nada y el registro de
   * `auth` lo purga Supabase. Un borrado irreversible sin rastro no se puede ni
   * auditar ni explicar.
   */
  it("la baja se anota, diciendo que la pidió el propio usuario", async () => {
    await conHistorial();
    await darseDeBaja();
    const [f] = await q<{ action: string; entity_id: string; origen: string }>(
      "select action, entity_id, metadata->>'origen' as origen from public.audit_logs",
    );
    expect(f.action).toBe("deactivate_user");
    expect(f.entity_id).toBe(CLIENTE);
    expect(f.origen).toBe("el propio usuario");
  });

  it("y el borrado también SOBREVIVE al borrado", async () => {
    // `actor_id` es SET NULL, así que la fila queda sin autor; el `entity_id` es
    // texto y no una FK, y por eso conserva de quién se trataba. Si se anotara
    // después del delete, no habría fila que anotar.
    await darseDeBaja();
    const [f] = await q<{ action: string; entity_id: string; actor_id: string | null }>(
      "select action, entity_id, actor_id from public.audit_logs",
    );
    expect(f.action).toBe("delete_user");
    expect(f.entity_id).toBe(CLIENTE);
    expect(f.actor_id).toBeNull();
  });
});

describe("las dos puertas usan el MISMO criterio", () => {
  it("la 0144 llama a `tiene_rastro_comercial`, no a una copia suya", () => {
    // Es la causa raíz del incidente: la regla se escribió una vez para el panel
    // y el otro camino se quedó con la versión vieja. Con una sola función, el
    // día que cambie el criterio cambia en los dos sitios a la vez.
    expect(MIG).toContain("public.tiene_rastro_comercial(uid)");
    // Y que no se haya vuelto a escribir el criterio a mano aquí.
    expect(MIG).not.toContain("exists (select 1 from public.listings where owner_id");
  });
});

describe("quién puede llamarla", () => {
  it("sin sesión no se borra nada", async () => {
    await comoSiFuera(null);
    await expect(db.exec("select public.delete_my_account();"))
      .rejects.toThrow(/No hay una sesión activa/i);
    await comoSiFuera(CLIENTE);
  });

  it("la llave anónima no puede ejecutarla", async () => {
    // Por la 0104 nace sin permisos, pero el DROP + CREATE de esta migración
    // obliga a volver a concederlos: sin el grant, 42501 en silencio.
    for (const [rol, esperado] of [["anon", false], ["authenticated", true]] as const) {
      const [{ ok }] = await q<{ ok: boolean }>(
        `select has_function_privilege('${rol}', 'public.delete_my_account()', 'execute') as ok`,
      );
      expect(ok).toBe(esperado);
    }
  });

  it("`mi_cuenta_tiene_rastro` solo responde por uno mismo", async () => {
    // `tiene_rastro_comercial` acepta cualquier uuid y está concedida a
    // `authenticated`: exponerla tal cual dejaría preguntar por otros.
    await conHistorial();
    expect(await num("select public.mi_cuenta_tiene_rastro()::int")).toBe(1);

    await comoSiFuera(CURIOSO);
    expect(await num("select public.mi_cuenta_tiene_rastro()::int")).toBe(0);
    await comoSiFuera(CLIENTE);
  });

  it("y sin sesión devuelve false, no revienta", async () => {
    await comoSiFuera(null);
    expect(await num("select public.mi_cuenta_tiene_rastro()::int")).toBe(0);
    await comoSiFuera(CLIENTE);
  });
});

