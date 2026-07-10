// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0049 (el fichero REAL) contra un Postgres de verdad.
 *
 * Lo que hay que garantizar: se avisa al dueño de un aviso que caduca dentro de
 * la próxima hora, UNA sola vez, y solo si el aviso sigue activo. Un despiste
 * aquí sería o no avisar nunca, o avisar en bucle cada 15 minutos.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0049_listing_expiry_notice.sql"),
  "utf8",
);

let db: PGlite;

const OWNER = "11111111-1111-1111-1111-111111111111";

// Inserta un aviso con vencimiento relativo a ahora (en minutos).
const seedListing = (id: string, status: string, venceEnMin: number | null) =>
  db.exec(`
    insert into public.listings (id, owner_id, title, status, expires_at)
    values ('${id}', '${OWNER}', 'Aviso ${id}', '${status}',
            ${venceEnMin === null ? "null" : `now() + interval '${venceEnMin} minutes'`});
  `);

const run = async () => {
  const { rows } = await db.query<{ n: number }>("select public.notify_expiring_listings() as n");
  return rows[0].n;
};

const notifs = async () => {
  const { rows } = await db.query<{ type: string; channel: string; title: string; payload: any }>(
    "select type, channel, title, payload from public.notifications order by channel",
  );
  return rows;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create table public.profiles (id uuid primary key);
    create table public.notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid, type text, channel text not null default 'in_app',
      title text, payload jsonb, read_at timestamptz, created_at timestamptz not null default now()
    );
    create table public.notification_preferences (
      user_id uuid, event_type text,
      in_app boolean not null default true, push boolean not null default false, email boolean not null default false,
      primary key (user_id, event_type)
    );
    create table public.listings (
      id uuid primary key, owner_id uuid, title text, status text,
      expires_at timestamptz, published_at timestamptz
    );

    -- notify_user real (copiado de 0014): in-app siempre por defecto; push/email según preferencia.
    create function public.notify_user(p_user uuid, p_event text, p_title text, p_payload jsonb)
    returns void language plpgsql as $$
    declare v_in_app boolean; v_push boolean; v_email boolean;
    begin
      if p_user is null then return; end if;
      select in_app, push, email into v_in_app, v_push, v_email
      from public.notification_preferences where user_id = p_user and event_type = p_event;
      if coalesce(v_in_app, true) then
        insert into public.notifications (user_id, type, channel, title, payload) values (p_user, p_event, 'in_app', p_title, p_payload);
      end if;
      if coalesce(v_push, false) then
        insert into public.notifications (user_id, type, channel, title, payload) values (p_user, p_event, 'push', p_title, p_payload);
      end if;
      if coalesce(v_email, false) then
        insert into public.notifications (user_id, type, channel, title, payload) values (p_user, p_event, 'email', p_title, p_payload);
      end if;
    end $$;

    insert into public.profiles (id) values ('${OWNER}');
  `);
  await db.exec(MIGRATION);
});

beforeEach(() => db.exec("delete from public.notifications; delete from public.listings;"));

describe("notify_expiring_listings", () => {
  it("avisa de un aviso activo que vence dentro de la próxima hora", async () => {
    await seedListing("aaaaaaaa-0000-0000-0000-000000000001", "active", 30);
    expect(await run()).toBe(1);

    const rows = await notifs();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("listing_expiring");
    expect(rows[0].channel).toBe("in_app");
    expect(rows[0].payload.listing_title).toBe("Aviso aaaaaaaa-0000-0000-0000-000000000001");
    expect(rows[0].payload.listing_id).toBe("aaaaaaaa-0000-0000-0000-000000000001");
  });

  it("NO vuelve a avisar el mismo aviso en la siguiente corrida", async () => {
    await seedListing("aaaaaaaa-0000-0000-0000-000000000002", "active", 20);
    expect(await run()).toBe(1);
    expect(await run()).toBe(0); // ya marcado en expiry_notified_at
    expect(await notifs()).toHaveLength(1);
  });

  it("NO avisa si aún falta más de una hora", async () => {
    await seedListing("aaaaaaaa-0000-0000-0000-000000000003", "active", 5 * 60);
    expect(await run()).toBe(0);
    expect(await notifs()).toHaveLength(0);
  });

  it("NO avisa de un aviso ya vencido (expires_at en el pasado)", async () => {
    await seedListing("aaaaaaaa-0000-0000-0000-000000000004", "active", -10);
    expect(await run()).toBe(0);
  });

  it("NO avisa de un aviso pausado aunque venza pronto", async () => {
    await seedListing("aaaaaaaa-0000-0000-0000-000000000005", "paused", 30);
    expect(await run()).toBe(0);
  });

  it("respeta la preferencia de push: crea también la fila de push", async () => {
    await db.exec(`insert into public.notification_preferences (user_id, event_type, in_app, push)
                   values ('${OWNER}', 'listing_expiring', true, true);`);
    await seedListing("aaaaaaaa-0000-0000-0000-000000000006", "active", 30);
    expect(await run()).toBe(1);

    const rows = await notifs();
    expect(rows.map((r) => r.channel).sort()).toEqual(["in_app", "push"]);
  });
});
