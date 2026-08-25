// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0121 — los tres canales de notificación, activados de fábrica.
 *
 * Lo que hay que comprobar de verdad:
 *  1. Que a un usuario que NUNCA tocó Configuración le llegan los tres. Es el
 *     caso de casi todos: la fila de preferencias solo nace al guardar, así que
 *     lo que decide no es el DEFAULT de la columna sino el `coalesce` de
 *     `notify_user`. Antes ese coalesce apagaba push y correo, y un anunciante
 *     no se enteraba de que su aviso vencía salvo que entrara a la web.
 *  2. Que a quien SÍ eligió no se le pisa la decisión. Encenderle el correo por
 *     migración a alguien que lo apagó es exactamente lo que no se puede hacer.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0121_notificaciones_activadas_por_defecto.sql"),
  "utf8",
);

const NUEVO   = "00000000-0000-0000-0000-0000000000a1"; // nunca tocó nada
const ELIGIO  = "00000000-0000-0000-0000-0000000000a2"; // apagó el correo

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const canales = async (user: string) =>
  (await q<{ channel: string }>(
    `select channel from public.notifications where user_id = '${user}' order by channel`,
    // `order by channel` ordena por el ENUM (in_app, push, email), no alfabéticamente.
  )).map((r) => r.channel).sort();

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;

    create table public.profiles (id uuid primary key, full_name text);
    create type public.notification_channel as enum ('in_app', 'push', 'email');
    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, type text not null,
      channel public.notification_channel not null default 'in_app',
      title text, payload jsonb, created_at timestamptz not null default now()
    );

    -- Estado ANTERIOR a la migración (0014): push y correo apagados.
    create table public.notification_preferences (
      user_id    uuid not null references public.profiles (id) on delete cascade,
      event_type text not null,
      in_app     boolean not null default true,
      push       boolean not null default false,
      email      boolean not null default false,
      primary key (user_id, event_type)
    );
    create or replace function public.notify_user(p_user uuid, p_event text, p_title text, p_payload jsonb)
    returns void language plpgsql security definer set search_path = public as $$
    declare v_in_app boolean; v_push boolean; v_email boolean;
    begin
      if p_user is null then return; end if;
      select in_app, push, email into v_in_app, v_push, v_email
      from public.notification_preferences where user_id = p_user and event_type = p_event;
      if coalesce(v_in_app, true) then
        insert into public.notifications (user_id, type, channel, title, payload)
        values (p_user, p_event, 'in_app', p_title, p_payload); end if;
      if coalesce(v_push, false) then
        insert into public.notifications (user_id, type, channel, title, payload)
        values (p_user, p_event, 'push', p_title, p_payload); end if;
      if coalesce(v_email, false) then
        insert into public.notifications (user_id, type, channel, title, payload)
        values (p_user, p_event, 'email', p_title, p_payload); end if;
    end; $$;

    insert into public.profiles (id, full_name) values ('${NUEVO}', 'Ana'), ('${ELIGIO}', 'Beto');
    insert into public.notification_preferences (user_id, event_type, in_app, push, email)
    values ('${ELIGIO}', 'listing_expiring', true, true, false);
  `);
});

describe("0121 · antes de la migración", () => {
  it("al que nunca eligió solo le llegaba la campana", async () => {
    await db.exec(`select public.notify_user('${NUEVO}', 'listing_expiring', 'Vence', '{}'::jsonb);`);
    expect(await canales(NUEVO)).toEqual(["in_app"]);
  });
});

describe("0121 · después de la migración", () => {
  beforeAll(async () => {
    await db.exec(MIG);
    await db.exec(`delete from public.notifications;`);
  });
  beforeEach(async () => { await db.exec(`delete from public.notifications;`); });

  it("al que nunca eligió le llegan los tres canales", async () => {
    await db.exec(`select public.notify_user('${NUEVO}', 'listing_expiring', 'Vence', '{}'::jsonb);`);
    expect(await canales(NUEVO)).toEqual(["email", "in_app", "push"]);
  });

  it("a quien apagó el correo se le sigue respetando", async () => {
    await db.exec(`select public.notify_user('${ELIGIO}', 'listing_expiring', 'Vence', '{}'::jsonb);`);
    expect(await canales(ELIGIO)).toEqual(["in_app", "push"]);
    expect(await canales(ELIGIO)).not.toContain("email");
  });

  it("apagarlo todo sigue significando que no llega nada", async () => {
    await db.exec(`
      insert into public.notification_preferences (user_id, event_type, in_app, push, email)
      values ('${NUEVO}', 'new_message', false, false, false);
      select public.notify_user('${NUEVO}', 'new_message', 'Hola', '{}'::jsonb);`);
    expect(await canales(NUEVO)).toEqual([]);
  });

  it("una preferencia nueva nace con push y correo encendidos", async () => {
    // El DEFAULT de la columna importa para las filas parciales que crea la UI.
    await db.exec(`
      insert into public.notification_preferences (user_id, event_type) values ('${ELIGIO}', 'new_review');`);
    const [fila] = await q<{ in_app: boolean; push: boolean; email: boolean }>(
      `select in_app, push, email from public.notification_preferences
        where user_id = '${ELIGIO}' and event_type = 'new_review'`,
    );
    expect(fila).toEqual({ in_app: true, push: true, email: true });
  });

  it("sigue sin poder llamarla el navegador: escribiría en la campana de cualquiera", async () => {
    for (const rol of ["anon", "authenticated"]) {
      const [{ v }] = await q<{ v: string }>(
        `select has_function_privilege('${rol}', 'public.notify_user(uuid, text, text, jsonb)', 'execute')::text as v`,
      );
      expect(v).toBe("false");
    }
  });
});
