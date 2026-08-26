// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0130 — B-02: administración puede reactivar las notificaciones de un cliente.
 *
 * El caso lo contó el cliente tal cual: alguien llama diciendo que no le llegan
 * los avisos, y resulta que el se los desactivo hace meses. Hasta ahora solo se
 * le podia explicar por telefono donde pulsar.
 *
 * Va por RPC y NO abriendo la RLS. La politica de la tabla es "cada uno y solo
 * cada uno"; abrirla al personal daria escritura libre. Con la funcion, el
 * acceso pasa por una puerta que comprueba el permiso y deja constancia — que no
 * es burocracia: se esta tocando la configuracion de otra persona sin que ella
 * lo pida.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0130_admin_configura_notificaciones.sql"),
  "utf8",
);

const STAFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENTE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const permitido = { valor: true };

const poner = (evento: string, in_app: boolean, push: boolean, email: boolean) =>
  q(`select public.admin_set_notification_pref(
       '${CLIENTE}', '${evento}', ${in_app}, ${push}, ${email})`);

const leer = () =>
  q<{ event_type: string; in_app: boolean; push: boolean; email: boolean }>(
    `select * from public.admin_notification_prefs('${CLIENTE}') order by event_type`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${STAFF}'), ('${CLIENTE}');

    create table public.notification_preferences (
      user_id uuid references auth.users(id) on delete cascade,
      event_type text,
      in_app boolean not null default true,
      push boolean not null default true,
      email boolean not null default true,
      primary key (user_id, event_type)
    );

    create table public.permiso (ok boolean);
    insert into public.permiso values (true);
    create function auth.uid() returns uuid language sql stable as $$ select '${STAFF}'::uuid $$;
    create function public.has_perm(_m text, _a text) returns boolean
      language sql stable as $$ select ok from public.permiso limit 1 $$;
    create table public.auditoria (accion text, detalle jsonb);
    create function public.log_audit(a text, t text, o text, d jsonb) returns void
      language sql as $$ insert into public.auditoria values (a, d) $$;
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  permitido.valor = true;
  await db.exec(`
    update public.permiso set ok = true;
    delete from public.notification_preferences;
    delete from public.auditoria;
  `);
});

describe("reactivar lo que el usuario apago", () => {
  it("enciende un canal que estaba apagado", async () => {
    await poner("new_message", true, false, false);
    await poner("new_message", true, true, true);
    const f = (await leer())[0];
    expect(f.in_app).toBe(true);
    expect(f.push).toBe(true);
    expect(f.email).toBe(true);
  });

  it("y tambien puede apagarlo, si el usuario lo pide por telefono", async () => {
    await poner("new_message", true, false, true);
    const f = (await leer())[0];
    expect(f.push).toBe(false);
  });

  it("cada evento va por su cuenta", async () => {
    await poner("new_message", true, true, true);
    await poner("listing_expiring", false, false, false);
    const f = await leer();
    expect(f).toHaveLength(2);
    expect(f.find((x) => x.event_type === "listing_expiring")?.in_app).toBe(false);
  });
});

describe("solo devuelve lo GUARDADO", () => {
  it("un usuario sin filas no devuelve nada: lo que falta vale activado", async () => {
    // Es como funciona notify_user desde la 0121. Si esto devolviera filas en
    // falso, el panel enseñaria todo en gris a alguien que si recibe sus avisos.
    expect(await leer()).toHaveLength(0);
  });
});

describe("queda constancia de quien lo cambio", () => {
  it("con el valor anterior, para saber si cambio algo de verdad", async () => {
    await poner("new_message", true, false, false);
    await poner("new_message", true, true, true);
    const a = await q<{ accion: string; detalle: Record<string, unknown> }>(
      `select accion, detalle from public.auditoria order by ctid desc limit 1`);
    expect(a[0].accion).toBe("set_notification_pref");
    expect(a[0].detalle.evento).toBe("new_message");
    expect(JSON.stringify(a[0].detalle.antes)).toContain("false");
    expect(JSON.stringify(a[0].detalle.ahora)).toContain("true");
  });

  it("la primera vez el valor anterior es nulo, no un invento", async () => {
    await poner("new_message", true, true, true);
    const a = await q<{ detalle: Record<string, unknown> }>(
      `select detalle from public.auditoria limit 1`);
    expect(a[0].detalle.antes).toBeNull();
  });
});

describe("sin permiso no se toca", () => {
  it("cambiar exige permiso de edicion", async () => {
    await db.exec(`update public.permiso set ok = false;`);
    await expect(poner("new_message", true, true, true)).rejects.toThrow(/no autorizado/i);
  });

  it("y un evento vacio se rechaza", async () => {
    await expect(poner("   ", true, true, true)).rejects.toThrow(/falta el evento/i);
  });
});
