// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0053 (fichero REAL) contra un Postgres de verdad.
 *
 * `delete_my_account()` solo puede borrar al usuario que la llama (auth.uid()),
 * y su borrado arrastra en cascada perfil y datos. Un fallo aquí dejaría a un
 * usuario sin poder borrar su cuenta (requisito de tienda) o —peor— permitiría
 * borrar a otro.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0053_delete_my_account.sql"),
  "utf8",
);

let db: PGlite;
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

const asUser = (uid: string) => db.query(`select set_config('test.uid', '${uid}', false)`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema if not exists auth;
    create table auth.users (id uuid primary key);
    -- auth.uid() sale de una variable de sesión que fijamos por test.
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid', true), '')::uuid
    $$;
    -- Cadena de cascada como en producción: profiles -> auth.users, datos -> profiles.
    create table public.profiles (
      id uuid primary key references auth.users (id) on delete cascade
    );
    create table public.listings (
      id uuid primary key, owner_id uuid references public.profiles (id) on delete cascade
    );
  `);
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec(`delete from auth.users;`);
  await db.exec(`
    insert into auth.users (id) values ('${U1}'), ('${U2}');
    insert into public.profiles (id) values ('${U1}'), ('${U2}');
    insert into public.listings (id, owner_id) values
      ('aaaa1111-0000-0000-0000-000000000001', '${U1}'),
      ('bbbb2222-0000-0000-0000-000000000002', '${U2}');
  `);
});

const count = async (sql: string) => {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`);
  return rows[0].n;
};

describe("delete_my_account", () => {
  it("borra al usuario que llama y arrastra su perfil y avisos", async () => {
    await asUser(U1);
    await db.query(`select public.delete_my_account()`);

    expect(await count(`auth.users where id = '${U1}'`)).toBe(0);
    expect(await count(`public.profiles where id = '${U1}'`)).toBe(0);
    expect(await count(`public.listings where owner_id = '${U1}'`)).toBe(0);
  });

  it("no toca a los demás usuarios", async () => {
    await asUser(U1);
    await db.query(`select public.delete_my_account()`);

    expect(await count(`auth.users where id = '${U2}'`)).toBe(1);
    expect(await count(`public.listings where owner_id = '${U2}'`)).toBe(1);
  });

  it("sin sesión (auth.uid() nulo) falla y no borra nada", async () => {
    await asUser("");
    await expect(db.query(`select public.delete_my_account()`)).rejects.toBeTruthy();
    expect(await count(`auth.users`)).toBe(2);
  });
});
