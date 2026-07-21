// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * EFFE-039: al INSERTAR una postulación, el dueño del aviso recibe una
 * notificación 'new_application'. Antes solo se notificaba al postulante en el
 * cambio de estado (AFTER UPDATE), nunca al dueño en la postulación nueva.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0070 = read("0070_notify_new_application.sql");

const OWNER = "00000000-0000-0000-0000-0000000000a1";
const APPLICANT = "00000000-0000-0000-0000-0000000000b1";
const LISTING = "00000000-0000-0000-0000-0000000000e1";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create table public.listings (id uuid primary key, owner_id uuid, title text);
    create table public.job_applications (
      id uuid primary key default gen_random_uuid(), listing_id uuid, applicant_id uuid,
      status text default 'pending', created_at timestamptz default now()
    );
    create table public.notifications (
      id serial primary key, user_id uuid, type text, channel text, title text,
      payload jsonb, created_at timestamptz default now()
    );
    -- notify_user mínimo (in-app), como el de 0014.
    create function public.notify_user(p_user uuid, p_event text, p_title text, p_payload jsonb)
    returns void language plpgsql as $$
    begin
      if p_user is null then return; end if;
      insert into public.notifications (user_id, type, channel, title, payload)
      values (p_user, p_event, 'in_app', p_title, p_payload);
    end; $$;

    insert into public.listings (id, owner_id, title) values ('${LISTING}', '${OWNER}', 'Vacante de cocinero');
  `);
  await db.exec(MIG_0070);
});

beforeEach(async () => {
  await db.exec(`delete from public.notifications; delete from public.job_applications;`);
});

describe("EFFE-039: notificar al dueño ante una postulación nueva (0070)", () => {
  it("una postulación nueva crea notificación 'new_application' para el DUEÑO", async () => {
    await q(`insert into public.job_applications (listing_id, applicant_id) values ('${LISTING}', '${APPLICANT}')`);
    const rows = await q<{ user_id: string; type: string; payload: any }>(
      `select user_id, type, payload from public.notifications`);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(OWNER);
    expect(rows[0].type).toBe("new_application");
    expect(rows[0].payload.listing_id).toBe(LISTING);
    expect(rows[0].payload.listing_title).toBe("Vacante de cocinero");
  });

  it("el postulante NO recibe la notificación (es para el dueño)", async () => {
    await q(`insert into public.job_applications (listing_id, applicant_id) values ('${LISTING}', '${APPLICANT}')`);
    const [n] = await q<{ n: string }>(
      `select count(*)::text as n from public.notifications where user_id = '${APPLICANT}'`);
    expect(n.n).toBe("0");
  });
});
