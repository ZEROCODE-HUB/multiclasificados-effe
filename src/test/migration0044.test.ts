// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Corre la migración 0044 (el fichero REAL) contra un Postgres de verdad en WASM.
 *
 * Un `create function ... language sql` valida el cuerpo al crearse: si una
 * columna no existe o un cast no cuadra, Postgres lo rechaza aquí y no en
 * producción. Eso ya justifica el test.
 *
 * Lo que importa del RPC: que el moderador vea el aviso denunciado AUNQUE esté
 * deshabilitado —la vista `listing_cards` filtra `status = 'active'`, que es
 * exactamente por lo que no servía— y que nadie sin rol de staff lo vea.
 */

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0044_admin_get_listing.sql"),
  "utf8",
);

const DUENO = "00000000-0000-0000-0000-0000000000a1";
const ACTIVO = "00000000-0000-0000-0000-0000000000b1";
const RECHAZADO = "00000000-0000-0000-0000-0000000000b2";

let db: PGlite;

// El RPC decide con auth.uid() + is_staff(); los simulamos con un setting de
// sesión (`set local` no sobreviviría: cada exec va en su propia transacción).
const como = async (staff: boolean) => db.exec(`set test.staff = '${staff}';`);
const getListing = (id: string) => db.query<Record<string, unknown>>("select * from public.admin_get_listing($1)", [id]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    -- Supabase trae este rol de fábrica; pglite no. Lo necesita el GRANT final.
    create role authenticated;
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as $$
      select '00000000-0000-0000-0000-0000000000ff'::uuid $$;
    create function public.is_staff(p uuid) returns boolean language sql stable as $$
      select coalesce(nullif(current_setting('test.staff', true), '')::boolean, false) $$;

    create type public.listing_status as enum ('draft','pending','active','paused','rejected','expired');
    create type public.currency_code  as enum ('PEN','USD');

    create table public.profiles (id uuid primary key, full_name text);
    create table public.listings (
      id uuid primary key, owner_id uuid references public.profiles(id),
      title text, description text, price numeric, currency public.currency_code,
      condition text, category_id text, subcategory_id text, location text,
      status public.listing_status not null default 'active',
      featured boolean default false, urgent boolean default false, views int default 0,
      rejection_reason text, published_at timestamptz, created_at timestamptz default now()
    );
    create table public.listing_images (
      listing_id uuid references public.listings(id), url text, sort_order int
    );
  `);
  // Aquí es donde el fichero real se pone a prueba.
  await db.exec(MIGRATION);
});

beforeEach(async () => {
  await db.exec("delete from public.listing_images; delete from public.listings; delete from public.profiles;");
  await db.exec(`
    insert into public.profiles values ('${DUENO}', 'Oscar Mijael Pérez García');
    insert into public.listings (id, owner_id, title, description, price, currency, category_id, status, views)
      values ('${ACTIVO}', '${DUENO}', 'Casa', 'Bonita casa en la sierra', 120000, 'PEN', 'inmuebles', 'active', 42);
    insert into public.listings (id, owner_id, title, description, price, currency, category_id, status, rejection_reason)
      values ('${RECHAZADO}', '${DUENO}', 'Aviso falso', 'Descripción del aviso denunciado', 10, 'PEN', 'otros', 'rejected', 'Removido por moderación');
    insert into public.listing_images values
      ('${ACTIVO}', 'https://cdn/2.jpg', 2),
      ('${ACTIVO}', 'https://cdn/1.jpg', 1);
  `);
});

describe("admin_get_listing", () => {
  it("el staff ve un aviso deshabilitado, que es el caso de una denuncia resuelta", async () => {
    await como(true);
    const { rows } = await getListing(RECHAZADO);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Aviso falso");
    expect(rows[0].status).toBe("rejected");
    expect(rows[0].description).toBe("Descripción del aviso denunciado");
    expect(rows[0].rejection_reason).toBe("Removido por moderación");
  });

  it("quien no es staff no ve nada, ni siquiera un aviso activo", async () => {
    await como(false);
    expect((await getListing(ACTIVO)).rows).toHaveLength(0);
    expect((await getListing(RECHAZADO)).rows).toHaveLength(0);
  });

  it("devuelve las imágenes ordenadas por sort_order", async () => {
    await como(true);
    const { rows } = await getListing(ACTIVO);

    expect(rows[0].images).toEqual(["https://cdn/1.jpg", "https://cdn/2.jpg"]);
  });

  it("un aviso sin imágenes devuelve un array vacío, no null", async () => {
    await como(true);
    const { rows } = await getListing(RECHAZADO);

    expect(rows[0].images).toEqual([]);
  });

  it("trae el nombre del anunciante y los datos que el moderador necesita", async () => {
    await como(true);
    const { rows } = await getListing(ACTIVO);

    expect(rows[0].advertiser).toBe("Oscar Mijael Pérez García");
    expect(rows[0].advertiser_id).toBe(DUENO);
    expect(Number(rows[0].price)).toBe(120000);
    expect(rows[0].currency).toBe("PEN");
    expect(rows[0].views).toBe(42);
  });

  it("un id inexistente no devuelve filas ni revienta", async () => {
    await como(true);
    expect((await getListing("00000000-0000-0000-0000-00000000dead")).rows).toHaveLength(0);
  });

  it("es idempotente: volver a aplicarla no falla", async () => {
    await expect(db.exec(MIGRATION)).resolves.toBeDefined();
  });
});
