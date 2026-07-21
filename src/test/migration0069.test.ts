// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * EFFE-030: solo el emisor (o staff) puede EDITAR un mensaje. Antes, cualquier
 * participante de la conversación podía reescribir el body de un mensaje ajeno.
 * Además, marcar como leído (que toca los mensajes del OTRO) debe seguir
 * funcionando: mark_messages_read pasa a SECURITY DEFINER.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0069 = read("0069_messages_update_sender_only.sql");

const A = "00000000-0000-0000-0000-0000000000a1"; // vendedor (emisor del msg)
const B = "00000000-0000-0000-0000-0000000000b1"; // comprador (el otro participante)
const S = "00000000-0000-0000-0000-0000000000c1"; // staff
const CONV = "00000000-0000-0000-0000-0000000000e1";
const MSG = "00000000-0000-0000-0000-0000000000f1";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const como = (uid: string) => db.exec(`set role authenticated; set test.uid = '${uid}';`);
const comoSuper = () => db.exec(`reset role; set test.uid = '';`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid $$;

    create table public._staff (uid uuid primary key);
    create function public.is_staff(_uid uuid) returns boolean language sql stable
      security definer set search_path = public as $$
      select exists (select 1 from public._staff s where s.uid = _uid) $$;

    create table public.conversations (id uuid primary key, buyer_id uuid, seller_id uuid);
    create table public.messages (
      id uuid primary key, conversation_id uuid, sender_id uuid, body text,
      status text default 'sent', delivered_at timestamptz, read_at timestamptz,
      created_at timestamptz default now()
    );
    alter table public.messages enable row level security;
    create policy "messages_select" on public.messages for select using (exists (
      select 1 from public.conversations c where c.id = conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid() or public.is_staff(auth.uid()))));
    grant select, insert, update on public.messages to authenticated;
    grant select on public.conversations to authenticated;

    insert into public._staff values ('${S}');
    insert into public.conversations values ('${CONV}', '${B}', '${A}');
    insert into public.messages (id, conversation_id, sender_id, body) values ('${MSG}', '${CONV}', '${A}', 'original');
  `);
  await db.exec(MIG_0069);
});

beforeEach(async () => {
  await db.exec(`reset role; set test.uid = '';
    update public.messages set body = 'original', status = 'sent', read_at = null where id = '${MSG}';`);
});

const bodyOf = async () => (await q<{ body: string }>(`select body from public.messages where id = '${MSG}'`))[0].body;

describe("EFFE-030: UPDATE de mensajes solo por el emisor o staff (0069)", () => {
  it("el OTRO participante NO puede reescribir un mensaje ajeno (0 filas, body intacto)", async () => {
    await como(B);
    await q(`update public.messages set body = 'hackeado' where id = '${MSG}'`);
    await comoSuper();
    expect(await bodyOf()).toBe("original");
  });

  it("el emisor SÍ puede editar su propio mensaje", async () => {
    await como(A);
    await q(`update public.messages set body = 'corregido' where id = '${MSG}'`);
    await comoSuper();
    expect(await bodyOf()).toBe("corregido");
  });

  it("staff SÍ puede corregir/revertir un mensaje ajeno", async () => {
    await como(S);
    await q(`update public.messages set body = 'moderado' where id = '${MSG}'`);
    await comoSuper();
    expect(await bodyOf()).toBe("moderado");
  });

  it("marcar como leído (el receptor) sigue funcionando pese a la policy restrictiva", async () => {
    // B es el receptor del mensaje de A; no puede hacer UPDATE directo, pero el
    // RPC (SECURITY DEFINER) sí marca el mensaje del otro como leído.
    await como(B);
    await q(`select public.mark_messages_read('${CONV}')`);
    await comoSuper();
    const [m] = await q<{ read: boolean; status: string }>(
      `select (read_at is not null) as read, status from public.messages where id = '${MSG}'`);
    expect(m.read).toBe(true);
    expect(m.status).toBe("read");
  });
});
