// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0093 — la imagen por defecto de los avisos sin foto, configurable.
 *
 * Lo que hay que asegurar es el reparto de permisos: la imagen la ve CUALQUIERA
 * (un visitante sin cuenta mirando la portada) pero solo la cambia el staff.
 * `get_settings()` no valía para lo primero porque filtra por `is_staff` y ni
 * siquiera está concedida a `anon`; de ahí la función dedicada.
 */

const read = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");
// El SQL trae begin/commit para correr como script; PGlite ya ejecuta en su
// propia transacción, así que se quitan.
const MIG = read("0093_default_listing_image.sql").replace(/^\s*(begin|commit);\s*$/gim, "");

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const como = (rol: string) => db.exec(`set role ${rol};`);
const comoSuper = () => db.exec(`reset role;`);
const leer = async () => {
  const [r] = await q<{ v: string | null }>(`select public.default_listing_image() as v`);
  return r.v;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create function public.has_perm(text, text) returns boolean language sql stable as $$ select false $$;

    create table public.system_settings (
      key text primary key, value jsonb not null default '{}'::jsonb,
      label text, updated_at timestamptz not null default now()
    );

    -- Storage, en lo mínimo que la migración necesita.
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
    create table storage.objects (id serial primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
  `);
  await db.exec(MIG);
  await db.exec(`grant execute on function public.default_listing_image() to anon, authenticated;`);
});

beforeEach(async () => {
  await comoSuper();
  await db.exec(`delete from public.system_settings;`);
});

describe("0093 — imagen por defecto de los avisos", () => {
  it("sin nada configurado devuelve null, para que el cliente use la del bundle", async () => {
    expect(await leer()).toBeNull();
  });

  it("un visitante SIN cuenta puede leerla: la portada se ve sin sesión", async () => {
    await db.exec(`insert into public.system_settings (key, value) values
      ('default_listing_image', '"https://cdn.effe.pe/sin-foto.webp"'::jsonb);`);
    await como("anon");
    expect(await leer()).toBe("https://cdn.effe.pe/sin-foto.webp");
    await comoSuper();
  });

  it("una cadena vacía cuenta como 'no hay': no se sirve una URL rota", async () => {
    await db.exec(`insert into public.system_settings (key, value) values ('default_listing_image', '""'::jsonb);`);
    expect(await leer()).toBeNull();
  });

  it("un valor que no es texto tampoco rompe nada", async () => {
    // Si alguien mete un número o un objeto por error, se cae a la del bundle
    // en vez de devolver basura que el <img> no sabría cargar.
    for (const v of ["123", "true", '{"a":1}', "null"]) {
      await db.exec(`insert into public.system_settings (key, value) values ('default_listing_image', '${v}'::jsonb)
        on conflict (key) do update set value = excluded.value;`);
      expect(await leer(), v).toBeNull();
    }
  });

  it("el bucket es público en lectura y con tope de 5 MB", async () => {
    const [b] = await q<{ public: boolean; file_size_limit: string }>(
      `select public, file_size_limit::text as file_size_limit from storage.buckets where id = 'site-assets'`,
    );
    expect(b.public).toBe(true);
    expect(Number(b.file_size_limit)).toBe(5242880);
  });

  it("escribir en el bucket exige permiso: sin él, no se puede subir", async () => {
    // `has_perm` está stubeada a false, o sea "un usuario cualquiera".
    await db.exec(`grant insert, select on storage.objects to authenticated;
                   grant usage on sequence storage.objects_id_seq to authenticated;`);
    await como("authenticated");
    await expect(
      q(`insert into storage.objects (bucket_id, name) values ('site-assets', 'x.webp')`),
    ).rejects.toThrow(/row-level security|violates/i);
    await comoSuper();
  });

  it("con permiso sí se puede subir", async () => {
    await db.exec(`create or replace function public.has_perm(text, text)
                     returns boolean language sql stable as $$ select true $$;`);
    await como("authenticated");
    await q(`insert into storage.objects (bucket_id, name) values ('site-assets', 'x.webp')`);
    await comoSuper();
    expect((await q(`select 1 from storage.objects where bucket_id = 'site-assets'`)).length).toBe(1);
    await db.exec(`create or replace function public.has_perm(text, text)
                     returns boolean language sql stable as $$ select false $$;`);
  });

  it("la lectura del bucket es pública, también sin cuenta", async () => {
    const [p] = await q<{ roles: string }>(
      `select coalesce(array_to_string(polroles::regrole[], ','), 'todos') as roles
         from pg_policy where polname = 'site_assets_public_read'`,
    );
    // polroles = {0} significa PUBLIC, es decir, todos los roles.
    expect(p.roles).toMatch(/^(-|todos)$/);
  });
});
