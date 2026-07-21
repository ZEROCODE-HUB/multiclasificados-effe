// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0071 — endurecimiento de los RPC de créditos:
 *  - add_credits deja de ser ejecutable por `authenticated` (era ejecutable por
 *    PUBLIC/anon/authenticated y regalaba créditos sin guard).
 *  - spend_credits solo permite gastar los créditos PROPIOS (p_user_id = auth.uid()).
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
const MIG_0071 = read("0071_harden_credit_rpcs.sql");

const A = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b1";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const como = (uid: string) => db.exec(`set role authenticated; set test.uid = '${uid}';`);
const comoSuper = () => db.exec(`reset role; set test.uid = '';`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid $$;

    create table public.user_credits (user_id uuid primary key, balance numeric, updated_at timestamptz);
    create table public.credit_transactions (
      id serial primary key, user_id uuid, type text, credits numeric,
      description text, listing_id uuid, order_id uuid
    );

    -- Stub de add_credits con grant a authenticated (para que 0071 lo revoque).
    create function public.add_credits(uuid, numeric, text, uuid) returns void
      language sql as $$ select $$;
    grant execute on function public.add_credits(uuid, numeric, text, uuid) to authenticated;

    grant select, insert, update on public.user_credits to authenticated;
    grant select, insert on public.credit_transactions to authenticated;
    grant usage on sequence public.credit_transactions_id_seq to authenticated;
  `);
  await db.exec(MIG_0071);
  // spend_credits necesita execute para authenticated (0035 lo daba; aquí lo reponemos).
  await db.exec(`grant execute on function public.spend_credits(uuid, numeric, uuid, text) to authenticated;`);
});

beforeEach(async () => {
  await db.exec(`reset role; set test.uid = '';
    delete from public.credit_transactions;
    insert into public.user_credits (user_id, balance, updated_at) values
      ('${A}', 100, now()), ('${B}', 100, now())
    on conflict (user_id) do update set balance = 100;`);
});

describe("0071 — endurecimiento de créditos", () => {
  it("authenticated NO puede llamar add_credits (revocado)", async () => {
    await como(A);
    await expect(
      q(`select public.add_credits('${A}', 999, 'hack', null)`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("spend_credits: NO se pueden gastar créditos ajenos", async () => {
    await como(A);
    await expect(
      q(`select public.spend_credits('${B}', 10, null, 'robo')`),
    ).rejects.toThrow(/no autorizado/i);
    await comoSuper();
    const [b] = await q<{ balance: string }>(`select balance::text as balance from public.user_credits where user_id = '${B}'`);
    expect(b.balance).toBe("100"); // intacto
  });

  it("spend_credits: sí se gastan los créditos propios; insuficiente devuelve false", async () => {
    await como(A);
    const [ok] = await q<{ r: boolean }>(`select public.spend_credits('${A}', 30, null, 'aviso') as r`);
    expect(ok.r).toBe(true);
    const [tooMuch] = await q<{ r: boolean }>(`select public.spend_credits('${A}', 9999, null, 'aviso') as r`);
    expect(tooMuch.r).toBe(false);
    await comoSuper();
    const [a] = await q<{ balance: string }>(`select balance::text as balance from public.user_credits where user_id = '${A}'`);
    expect(a.balance).toBe("70");
  });
});
