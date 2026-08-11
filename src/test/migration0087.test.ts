// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * La 0087 (fichero REAL) contra un Postgres de verdad.
 *
 * Hace dos cosas que conviene no confundir:
 *   1. la vista `listing_cards` expone `advertiser_verified`, para que la
 *      tarjeta pueda enseñar el sello solo a quien le corresponde;
 *   2. limpia el dato: `profiles.verified` se ponía también al publicar tras
 *      validar el DNI en Factiliza, con lo que casi cualquiera que hubiese
 *      publicado quedaba marcado como verificado sin que nadie lo aprobara.
 *
 * Lo segundo es lo delicado: quitar el sello a quien SÍ lo aprobó un
 * administrador sería deshacer una decisión suya. Quién lo tiene aprobado se
 * saca de la auditoría, que es donde admin_verify_user deja constancia.
 */

const leer = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations/", f), "utf8");
const M0087 = leer("0087_advertiser_verified.sql");

let db: PGlite;

const ANA    = "00000000-0000-0000-0000-00000000000a"; // la verificó un admin
const BRUNO  = "00000000-0000-0000-0000-00000000000b"; // se "verificó" al publicar
const CARLA  = "00000000-0000-0000-0000-00000000000c"; // nunca estuvo verificada
const DIEGO  = "00000000-0000-0000-0000-00000000000d"; // aprobado y luego retirado
const ADMIN  = "00000000-0000-0000-0000-0000000000ff";

async function montar() {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create type public.currency as enum ('PEN','USD');

    create table public.profiles (
      id uuid primary key, full_name text, rating numeric,
      verified boolean not null default false,
      doc_type text, doc_number text
    );
    create table public.audit_logs (
      id bigint generated always as identity primary key,
      actor_id uuid, action text not null, entity_type text, entity_id text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create table public.listings (
      id uuid primary key, owner_id uuid references public.profiles(id),
      title text, description text, price numeric, currency public.currency,
      condition text, category_id text, subcategory_id uuid,
      location text, lat numeric, lng numeric, department text,
      status text default 'active',
      featured boolean default false, urgent boolean default false,
      confidential boolean default false, views int default 0,
      published_at timestamptz default now(), created_at timestamptz default now(),
      expires_at timestamptz
    );
    create table public.listing_images (listing_id uuid, url text, sort_order int);

    -- La vista tal como la dejó la 0084: sin advertiser_verified.
    create or replace view public.listing_cards as
      select l.id, l.owner_id, l.title, l.description, l.price, l.currency,
             l.condition, l.category_id, l.subcategory_id, l.location, l.lat, l.lng,
             l.status, l.featured, l.urgent, l.confidential, l.views,
             l.published_at, l.created_at, l.expires_at,
             p.full_name as advertiser, p.rating as advertiser_rating,
             null::text as image_url, l.department
        from public.listings l join public.profiles p on p.id = l.owner_id
       where l.status = 'active';

    -- Y el buscador de la 0085, que depende de ella. Está aquí para comprobar
    -- que la migración sabe retirarlo y volver a ponerlo.
    create or replace function public.search_listings(
      p_query text default null, p_category text default null,
      p_subcategory uuid default null, p_price_min numeric default null,
      p_price_max numeric default null, p_currency public.currency default null,
      p_department text default null, p_sort text default 'recent',
      p_limit int default 24, p_offset int default 0,
      p_lat numeric default null, p_lng numeric default null
    ) returns setof public.listing_cards language sql stable as $fn$
      select lc.* from public.listing_cards lc
       where (p_department is null or lc.department = p_department)
       limit greatest(0, p_limit) offset greatest(0, p_offset);
    $fn$;

    insert into public.profiles (id, full_name, verified, doc_number) values
      ('${ANA}',   'Ana',   true,  '44556677'),
      ('${BRUNO}', 'Bruno', true,  '11223344'),
      ('${CARLA}', 'Carla', false, null),
      ('${DIEGO}', 'Diego', true,  '99887766'),
      ('${ADMIN}', 'Admin', false, null);

    insert into public.listings (id, owner_id, title, price, currency, location, department) values
      ('10000000-0000-0000-0000-000000000001', '${ANA}',   'De Ana',   10, 'PEN', 'Lima', '15'),
      ('10000000-0000-0000-0000-000000000002', '${BRUNO}', 'De Bruno', 10, 'PEN', 'Lima', '15'),
      ('10000000-0000-0000-0000-000000000003', '${CARLA}', 'De Carla', 10, 'PEN', 'Lima', '15');
  `);

  // La auditoría: a Ana la aprobó un administrador; a Diego se lo aprobaron y
  // luego se lo retiraron (manda la última decisión). De Bruno no hay rastro:
  // su sello lo puso la publicación.
  await db.exec(`
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at) values
      ('${ADMIN}', 'verify_user', 'user', '${ANA}',   '{"verified": true}',  now() - interval '10 days'),
      ('${ADMIN}', 'verify_user', 'user', '${DIEGO}', '{"verified": true}',  now() - interval '9 days'),
      ('${ADMIN}', 'verify_user', 'user', '${DIEGO}', '{"verified": false}', now() - interval '1 day'),
      ('${ADMIN}', 'set_user_status', 'user', '${BRUNO}', '{"status": "active"}', now());
  `);
}

const verificado = async (id: string) => {
  const { rows } = await db.query<{ verified: boolean }>(
    `select verified from public.profiles where id = '${id}'`,
  );
  return rows[0].verified;
};

beforeEach(montar);

describe("0087 — la vista dice si el anunciante está verificado", () => {
  it("antes de la migración esa columna no existe", async () => {
    await expect(db.query("select advertiser_verified from public.listing_cards")).rejects.toThrow();
  });

  it("después, cada aviso trae el sello de su dueño", async () => {
    await db.exec(M0087);
    const { rows } = await db.query<{ title: string; advertiser_verified: boolean }>(
      "select title, advertiser_verified from public.listing_cards order by title",
    );
    expect(rows).toEqual([
      { title: "De Ana",   advertiser_verified: true },  // la aprobó un admin
      { title: "De Bruno", advertiser_verified: false }, // solo validó su DNI
      { title: "De Carla", advertiser_verified: false },
    ]);
  });

  it("el buscador también lo devuelve: la tarjeta sale de ahí", async () => {
    // search_listings devuelve `setof listing_cards`; si la migración no lo
    // volviera a crear tras tocar la vista, el buscador entero se quedaría sin
    // la columna o directamente sin existir.
    await db.exec(M0087);
    const { rows } = await db.query<{ advertiser_verified: boolean }>(
      "select advertiser_verified from public.search_listings(null,null,null,null,null,null,'15','recent',50,0,null,null) order by title",
    );
    expect(rows.map((r) => r.advertiser_verified)).toEqual([true, false, false]);
  });

  it("un anunciante sin sello no rompe nada (nunca devuelve null)", async () => {
    await db.exec(M0087);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.listing_cards where advertiser_verified is null",
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("0087 — dejar el sello solo en quien lo aprobó un administrador", () => {
  it("respeta a quien un admin verificó", async () => {
    await db.exec(M0087);
    expect(await verificado(ANA)).toBe(true);
  });

  it("se lo quita a quien lo tenía solo por haber publicado", async () => {
    expect(await verificado(BRUNO)).toBe(true);
    await db.exec(M0087);
    expect(await verificado(BRUNO)).toBe(false);
  });

  it("obedece la ÚLTIMA decisión: a quien se lo retiraron, sigue retirado", async () => {
    // Si se mirara "¿alguna vez lo aprobaron?" en vez de la última decisión,
    // esta migración le devolvería el sello a alguien a quien se lo quitaron.
    expect(await verificado(DIEGO)).toBe(true);
    await db.exec(M0087);
    expect(await verificado(DIEGO)).toBe(false);
  });

  it("no le pone el sello a quien no lo tenía", async () => {
    await db.exec(M0087);
    expect(await verificado(CARLA)).toBe(false);
  });

  it("no borra el documento: lo validado sigue validado", async () => {
    // Quitar el sello no es decir que su DNI sea falso. El número se conserva,
    // que es lo que alimenta el comprobante de la compra de créditos.
    await db.exec(M0087);
    const { rows } = await db.query<{ doc_number: string | null }>(
      `select doc_number from public.profiles where id = '${BRUNO}'`,
    );
    expect(rows[0].doc_number).toBe("11223344");
  });

  it("se puede aplicar dos veces sin cambiar nada la segunda", async () => {
    await db.exec(M0087);
    const antes = await Promise.all([ANA, BRUNO, CARLA, DIEGO].map(verificado));
    await db.exec(M0087);
    expect(await Promise.all([ANA, BRUNO, CARLA, DIEGO].map(verificado))).toEqual(antes);
  });

  it("con la auditoría vacía se queda sin sellos, no con todos", async () => {
    // El caso de una base donde nunca se usó el botón de verificar: lo correcto
    // es no afirmar nada de nadie, y que el equipo vaya poniendo los sellos.
    await db.exec("delete from public.audit_logs");
    await db.exec(M0087);
    for (const u of [ANA, BRUNO, CARLA, DIEGO]) expect(await verificado(u)).toBe(false);
  });
});
