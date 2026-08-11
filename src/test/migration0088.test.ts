// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Segmentar el envío masivo por categoría (fichero REAL de la migración).
 *
 * Aquí se decide a quién le llega un correo, y un error no se puede deshacer:
 * o le escribes a media plataforma, o dejas fuera justo a quien querías avisar.
 * Por eso se corre contra un Postgres de verdad y no contra una simulación.
 *
 * Lo que más se comprueba es una propiedad concreta: que el número que enseña
 * el botón "Enviar a N" y el número de personas a las que realmente se escribe
 * sean SIEMPRE el mismo. Antes eran dos caminos distintos en el código.
 */

const M0088 = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0088_broadcast_por_categoria.sql"), "utf8");

let db: PGlite;

const ANA   = "00000000-0000-0000-0000-00000000000a"; // inmuebles vigente
const BRUNO = "00000000-0000-0000-0000-00000000000b"; // inmuebles vencido
const CARLA = "00000000-0000-0000-0000-00000000000c"; // vehículos vigente
const DIEGO = "00000000-0000-0000-0000-00000000000d"; // nunca publicó
const ELSA  = "00000000-0000-0000-0000-00000000000e"; // inmuebles 'active' pero con la fecha pasada
const JEFE  = "00000000-0000-0000-0000-0000000000ff"; // admin

async function montar() {
  db = new PGlite();
  await db.exec(`
    -- Roles que Supabase trae de serie: la migración les revoca el permiso de
    -- ejecutar comm_destinatarios y sin ellos ni siquiera se aplica.
    create role anon;
    create role authenticated;

    -- Quien está usando el panel. admin_audience_count pregunta por auth.uid()
    -- antes de contar nada.
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable
      as $$ select '00000000-0000-0000-0000-0000000000ff'::uuid $$;

    create table public.profiles (id uuid primary key, full_name text);
    create table public.user_roles (user_id uuid, role text);
    create table public.categories (id text primary key, name text);
    create table public.listings (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references public.profiles(id),
      category_id text, status text, expires_at timestamptz
    );
    create table public.notifications (
      id bigint generated always as identity primary key,
      user_id uuid, type text, channel text, title text, payload jsonb,
      created_at timestamptz default now()
    );
    create table public.audit_logs (
      id bigint generated always as identity primary key,
      actor_id uuid, action text, entity_type text, entity_id text,
      metadata jsonb default '{}'::jsonb, created_at timestamptz default now()
    );

    -- Permisos: en las pruebas siempre se concede. Lo que se está probando es a
    -- quién llega el mensaje, no el control de acceso (que tiene lo suyo).
    create or replace function public.is_staff(u uuid) returns boolean
      language sql stable as $$ select true $$;
    create or replace function public.has_perm(m text, a text) returns boolean
      language sql stable as $$ select true $$;
    create or replace function public.log_audit(
      p_action text, p_entity_type text default null, p_entity_id text default null,
      p_metadata jsonb default '{}'::jsonb) returns void
      language sql as $$
        insert into public.audit_logs (action, entity_type, entity_id, metadata)
        values (p_action, p_entity_type, p_entity_id, p_metadata);
      $$;

    -- La audiencia base tal como la define la 0039: 'all' = todo el mundo, o
    -- los perfiles con ese rol.
    create or replace function public.comm_audience(p_audience text)
    returns setof uuid language sql stable as $$
      select p.id from public.profiles p
      where p_audience = 'all'
         or exists (select 1 from public.user_roles ur
                    where ur.user_id = p.id and ur.role = p_audience);
    $$;

    create or replace function public.admin_audience_count(p_audience text)
      returns integer language sql stable as $$ select 0 $$;
    create or replace function public.admin_broadcast(
      p_audience text, p_title text, p_body text,
      p_email boolean default false, p_copy_staff boolean default false)
      returns integer language sql as $$ select 0 $$;

    insert into public.categories values ('inmuebles','Inmuebles'), ('vehiculos','Vehículos'), ('empleos','Empleos');
    insert into public.profiles values
      ('${ANA}','Ana'), ('${BRUNO}','Bruno'), ('${CARLA}','Carla'),
      ('${DIEGO}','Diego'), ('${ELSA}','Elsa'), ('${JEFE}','Jefa');

    -- Todo usuario no-staff tiene el rol 'buscador'; la jefa es admin.
    insert into public.user_roles values
      ('${ANA}','buscador'), ('${BRUNO}','buscador'), ('${CARLA}','buscador'),
      ('${DIEGO}','buscador'), ('${ELSA}','buscador'), ('${JEFE}','admin');

    insert into public.listings (owner_id, category_id, status, expires_at) values
      ('${ANA}',   'inmuebles', 'active',  now() + interval '10 days'),
      ('${BRUNO}', 'inmuebles', 'expired', now() - interval '5 days'),
      ('${CARLA}', 'vehiculos', 'active',  now() + interval '3 days'),
      -- El caso traicionero: sigue marcado 'active' pero la fecha ya pasó,
      -- porque expire_listings() es una función que alguien tiene que ejecutar.
      ('${ELSA}',  'inmuebles', 'active',  now() - interval '1 day');
  `);
  await db.exec(M0088);
}

type Filtro = { cats?: string[] | null; vigentes?: boolean; staff?: boolean };

const arr = (c?: string[] | null) =>
  c === undefined || c === null ? "null" : `array[${c.map((x) => `'${x}'`).join(",")}]::text[]`;

const contar = async ({ cats, vigentes = false, staff = false }: Filtro = {}) => {
  const { rows } = await db.query<{ n: number }>(
    `select public.admin_audience_count('buscador', ${arr(cats)}, ${vigentes}, ${staff}) as n`);
  return rows[0].n;
};

const enviar = async ({ cats, vigentes = false, staff = false }: Filtro = {}) => {
  const { rows } = await db.query<{ n: number }>(
    `select public.admin_broadcast('buscador','Asunto','Cuerpo', false, ${staff}, ${arr(cats)}, ${vigentes}) as n`);
  return rows[0].n;
};

const quienesRecibieron = async () => {
  const { rows } = await db.query<{ full_name: string }>(
    `select distinct p.full_name from public.notifications n
       join public.profiles p on p.id = n.user_id order by 1`);
  return rows.map((r) => r.full_name);
};

beforeEach(montar);

describe("0088 — sin filtro, todo sigue como antes", () => {
  it("va a todos los usuarios reales", async () => {
    // Cinco 'buscador'; la jefa no entra porque es staff.
    expect(await contar()).toBe(5);
    expect(await contar({ cats: [] })).toBe(5);
  });

  it("con la copia, se suma el equipo interno", async () => {
    expect(await contar({ staff: true })).toBe(6);
  });

  it("y el envío alcanza exactamente a esos", async () => {
    expect(await enviar()).toBe(5);
    expect(await quienesRecibieron()).toEqual(["Ana", "Bruno", "Carla", "Diego", "Elsa"]);
  });
});

describe("0088 — filtrar por categoría", () => {
  it("solo los que publicaron ahí alguna vez", async () => {
    await enviar({ cats: ["inmuebles"] });
    // Bruno tiene el aviso vencido y Elsa uno caído: publicaron, así que entran.
    expect(await quienesRecibieron()).toEqual(["Ana", "Bruno", "Elsa"]);
  });

  it("varias categorías se suman, sin repetir a nadie", async () => {
    expect(await contar({ cats: ["inmuebles", "vehiculos"] })).toBe(4); // + Carla
    await enviar({ cats: ["inmuebles", "vehiculos"] });
    expect(await quienesRecibieron()).toEqual(["Ana", "Bruno", "Carla", "Elsa"]);
  });

  it("quien nunca publicó no recibe nada", async () => {
    await enviar({ cats: ["inmuebles", "vehiculos", "empleos"] });
    expect(await quienesRecibieron()).not.toContain("Diego");
  });

  it("una categoría en la que nadie publicó no tiene destinatarios", async () => {
    expect(await contar({ cats: ["empleos"] })).toBe(0);
  });

  it("una categoría inventada no cuela a todo el mundo", async () => {
    // El fallo peligroso sería que un filtro sin coincidencias se interpretara
    // como "sin filtro" y la campaña saliera a la plataforma entera.
    expect(await contar({ cats: ["categoria-que-no-existe"] })).toBe(0);
  });
});

describe("0088 — vigentes o histórico", () => {
  it("«solo vigentes» deja fuera a quien tiene el aviso vencido", async () => {
    await enviar({ cats: ["inmuebles"], vigentes: true });
    expect(await quienesRecibieron()).toEqual(["Ana"]);
  });

  it("un aviso todavía marcado 'active' pero con la fecha pasada NO es vigente", async () => {
    // Es el caso que se cuela si solo se mira el estado: expire_listings() hay
    // que ejecutarlo, así que puede haber avisos 'active' caducados hace días.
    expect(await contar({ cats: ["inmuebles"], vigentes: true })).toBe(1); // solo Ana
    const recibieron = await (async () => { await enviar({ cats: ["inmuebles"], vigentes: true }); return quienesRecibieron(); })();
    expect(recibieron).not.toContain("Elsa");
  });

  it("un aviso sin fecha de vencimiento sí es vigente", async () => {
    await db.exec(`insert into public.listings (owner_id, category_id, status, expires_at)
                   values ('${DIEGO}', 'empleos', 'active', null)`);
    expect(await contar({ cats: ["empleos"], vigentes: true })).toBe(1);
  });

  it("el histórico incluye a todos los que alguna vez publicaron ahí", async () => {
    expect(await contar({ cats: ["inmuebles"], vigentes: false })).toBe(3);
    expect(await contar({ cats: ["inmuebles"], vigentes: true })).toBe(1);
  });
});

describe("0088 — el contador y el envío no pueden discrepar", () => {
  // Es la razón de que las dos cosas salgan de la misma función. Si divergen,
  // el botón dice "Enviar a 40" y le llega a 300 personas.
  const combinaciones: Array<[string, Filtro]> = [
    ["sin filtro", {}],
    ["sin filtro + copia", { staff: true }],
    ["inmuebles, histórico", { cats: ["inmuebles"] }],
    ["inmuebles, vigentes", { cats: ["inmuebles"], vigentes: true }],
    ["dos categorías", { cats: ["inmuebles", "vehiculos"] }],
    ["dos categorías + copia", { cats: ["inmuebles", "vehiculos"], staff: true }],
    ["categoría vacía", { cats: ["empleos"] }],
    ["categoría vacía + copia", { cats: ["empleos"], staff: true }],
  ];

  it.each(combinaciones)("%s: lo que dice el botón es lo que se envía", async (_n, filtro) => {
    const anunciado = await contar(filtro);
    const enviado = await enviar(filtro);
    expect(enviado).toBe(anunciado);
  });
});

describe("0088 — el equipo interno con la copia activada", () => {
  it("recibe aunque no haya publicado en esa categoría", async () => {
    // La copia es para que el staff vea lo que se mandó; no depende de que
    // hayan publicado nada.
    await enviar({ cats: ["vehiculos"], vigentes: true, staff: true });
    const recibieron = await quienesRecibieron();
    expect(recibieron).toContain("Jefa");
    expect(recibieron).toContain("Carla");
    expect(recibieron).not.toContain("Ana");
  });

  it("sin copia, el staff no recibe el masivo", async () => {
    await enviar({ cats: ["inmuebles"] });
    expect(await quienesRecibieron()).not.toContain("Jefa");
  });
});

describe("0088 — queda constancia de a quién se le escribió", () => {
  it("la auditoría guarda las categorías y el criterio", async () => {
    // Con envíos segmentados, "a cuántos" ya no basta para reconstruir a quiénes.
    await enviar({ cats: ["inmuebles", "vehiculos"], vigentes: true });
    const { rows } = await db.query<{ metadata: Record<string, unknown> }>(
      `select metadata from public.audit_logs where action = 'broadcast'`);
    expect(rows[0].metadata).toMatchObject({
      categories: ["inmuebles", "vehiculos"],
      only_active: true,
    });
  });

  it("sin filtro lo deja explícito, no ausente", async () => {
    await enviar();
    const { rows } = await db.query<{ metadata: Record<string, unknown> }>(
      `select metadata from public.audit_logs where action = 'broadcast'`);
    expect(rows[0].metadata).toMatchObject({ categories: [], only_active: false });
  });
});

describe("0088 — el correo se manda solo si se pide", () => {
  it("por defecto solo hay notificación in-app", async () => {
    await enviar({ cats: ["inmuebles"] });
    const { rows } = await db.query<{ channel: string; n: number }>(
      `select channel, count(*)::int as n from public.notifications group by channel order by 1`);
    expect(rows).toEqual([{ channel: "in_app", n: 3 }]);
  });

  it("con email se crean las dos filas por destinatario", async () => {
    await db.query(
      `select public.admin_broadcast('buscador','Asunto','Cuerpo', true, false, array['inmuebles']::text[], false)`);
    const { rows } = await db.query<{ channel: string; n: number }>(
      `select channel, count(*)::int as n from public.notifications group by channel order by 1`);
    expect(rows).toEqual([{ channel: "email", n: 3 }, { channel: "in_app", n: 3 }]);
  });
});
