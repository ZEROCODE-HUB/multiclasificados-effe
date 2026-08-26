// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0124 — el freno de las ráfagas (H-06).
 *
 * Un límite de tasa tiene dos formas de salir mal, y la peligrosa **no** es la
 * que uno teme. Que se cuele un abusador cuesta moderación; que el freno salte
 * con un cliente que está pagando cuesta el cliente. Por eso aquí se prueban
 * las dos direcciones, y con más insistencia la segunda: quién NO debe ser
 * frenado (el personal, quien viene de ayer, el que va justo por debajo).
 *
 * El otro punto que se fija aquí es la válvula de escape: poner el tope a 0
 * desactiva el freno. Si eso no funcionara, un límite mal calibrado un sábado
 * por la tarde solo se podría arreglar con un despliegue.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0124_limite_de_tasa.sql"),
  "utf8",
);

const ANA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BENI = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JEFA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // del personal

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

/** Crea `n` avisos de golpe, saltándose el trigger (para preparar el terreno). */
const sembrarAvisos = (owner: string, n: number, haceHoras = 0) =>
  db.exec(`
    alter table public.listings disable trigger listings_limite_de_tasa;
    insert into public.listings (owner_id, created_at)
      select '${owner}', now() - interval '${haceHoras} hours' from generate_series(1, ${n});
    alter table public.listings enable trigger listings_limite_de_tasa;
  `);

const sembrarMensajes = (sender: string, n: number, haceHoras = 0) =>
  db.exec(`
    alter table public.messages disable trigger messages_limite_de_tasa;
    insert into public.messages (sender_id, created_at)
      select '${sender}', now() - interval '${haceHoras} hours' from generate_series(1, ${n});
    alter table public.messages enable trigger messages_limite_de_tasa;
  `);

const publicar = (owner: string) =>
  db.exec(`insert into public.listings (owner_id) values ('${owner}');`);

const enviar = (sender: string) =>
  db.exec(`insert into public.messages (sender_id) values ('${sender}');`);

/** Ejecuta algo y devuelve el mensaje de error, o null si pasó. */
const fallo = async (fn: () => Promise<unknown>): Promise<string | null> => {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
};

const ponerTope = (json: string) =>
  db.exec(`update public.system_settings set value = '${json}'::jsonb where key = 'limites_de_tasa';`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;

    create table public.system_settings (key text primary key, value jsonb not null);

    create table public.listings (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid,
      created_at timestamptz not null default now()
    );
    create table public.messages (
      id uuid primary key default gen_random_uuid(),
      sender_id uuid,
      created_at timestamptz not null default now()
    );

    -- Solo la jefa es del personal.
    create function public.is_staff(_uid uuid) returns boolean
      language sql stable as $$ select _uid = '${JEFA}'::uuid $$;
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec(`
    alter table public.listings disable trigger listings_limite_de_tasa;
    alter table public.messages disable trigger messages_limite_de_tasa;
    delete from public.listings;
    delete from public.messages;
    alter table public.listings enable trigger listings_limite_de_tasa;
    alter table public.messages enable trigger messages_limite_de_tasa;
  `);
  await ponerTope('{"aviso": {"hora": 30, "dia": 100}, "mensaje": {"hora": 60, "dia": 200}}');
});

describe("a quién NO se frena", () => {
  it("al que publica su primer aviso", async () => {
    expect(await fallo(() => publicar(ANA))).toBeNull();
  });

  it("al que va justo por debajo del tope", async () => {
    // 29 en la última hora, tope 30: el treintavo tiene que entrar.
    await sembrarAvisos(ANA, 29);
    expect(await fallo(() => publicar(ANA))).toBeNull();
  });

  it("al personal, por muchos que cargue", async () => {
    // Un administrador subiendo un catálogo no es el abuso que esto persigue.
    await sembrarAvisos(JEFA, 500);
    expect(await fallo(() => publicar(JEFA))).toBeNull();
  });

  it("al que publicó mucho AYER", async () => {
    // La ventana es móvil: lo de hace 25 horas ya no cuenta.
    await sembrarAvisos(ANA, 90, 25);
    expect(await fallo(() => publicar(ANA))).toBeNull();
  });

  it("a uno por lo que hizo OTRO", async () => {
    // El tope es por persona. Si contara global, el primer día de campaña la
    // app se cerraría sola.
    await sembrarAvisos(BENI, 50);
    expect(await fallo(() => publicar(ANA))).toBeNull();
  });
});

describe("a quién sí se frena", () => {
  it("al que hace 30 avisos en una hora", async () => {
    await sembrarAvisos(ANA, 30);
    expect(await fallo(() => publicar(ANA))).toMatch(/muchos avisos en poco tiempo/i);
  });

  it("al que llega a 100 en el día, aunque los reparta", async () => {
    // 100 repartidos en horas distintas: ninguna ventana de una hora se pasa,
    // pero la del día sí. Sin el tope diario, gotear 29 por hora durante ocho
    // horas serían 232 avisos y ninguna alarma.
    for (let h = 2; h <= 21; h++) await sembrarAvisos(ANA, 5, h);
    expect(await fallo(() => publicar(ANA))).toMatch(/máximo de avisos por día/i);
  });

  it("al que manda 60 mensajes en una hora", async () => {
    await sembrarMensajes(ANA, 60);
    expect(await fallo(() => enviar(ANA))).toMatch(/muchos mensajes en poco tiempo/i);
  });

  it("al que llega a 200 mensajes en el día", async () => {
    for (let h = 2; h <= 21; h++) await sembrarMensajes(ANA, 10, h);
    expect(await fallo(() => enviar(ANA))).toMatch(/máximo de mensajes por día/i);
  });
});

describe("lo que se le dice a la persona", () => {
  it("es una frase que se entiende, no un error de base de datos", async () => {
    await sembrarAvisos(ANA, 30);
    const msg = await fallo(() => publicar(ANA));
    expect(msg).not.toMatch(/trigger|function|constraint|relation|P0001/i);
    expect(msg).toMatch(/vuelve a intentarlo/i);
  });

  it("y dice qué hacer: esperar en el tope de la hora, escribirnos en el del día", async () => {
    await sembrarAvisos(ANA, 30);
    expect(await fallo(() => publicar(ANA))).toMatch(/espera unos minutos/i);

    await db.exec(`delete from public.listings;`);
    for (let h = 2; h <= 21; h++) await sembrarAvisos(ANA, 5, h);
    expect(await fallo(() => publicar(ANA))).toMatch(/escríbenos/i);
  });
});

describe("la válvula de escape", () => {
  it("con el tope en 0 no se frena a nadie", async () => {
    // Es lo que permite desactivarlo un sábado sin esperar a un despliegue.
    await ponerTope('{"aviso": {"hora": 0, "dia": 0}, "mensaje": {"hora": 0, "dia": 0}}');
    await sembrarAvisos(ANA, 500);
    expect(await fallo(() => publicar(ANA))).toBeNull();
  });

  it("los topes se pueden subir sin tocar código", async () => {
    await ponerTope('{"aviso": {"hora": 200, "dia": 1000}, "mensaje": {"hora": 60, "dia": 200}}');
    await sembrarAvisos(ANA, 150);
    expect(await fallo(() => publicar(ANA))).toBeNull();
  });
});

describe("la configuración no puede tumbar la publicación", () => {
  // Esto corre dentro de un trigger de INSERT. Un valor mal escrito en la
  // configuración NO puede tener como consecuencia que nadie pueda publicar,
  // así que ante cualquier duda se cae al valor por defecto.
  it("un texto donde iba un número cae al defecto", async () => {
    await ponerTope('{"aviso": {"hora": "muchos", "dia": "todos"}}');
    await sembrarAvisos(ANA, 29);
    expect(await fallo(() => publicar(ANA))).toBeNull();   // defecto 30
    await sembrarAvisos(ANA, 1);
    expect(await fallo(() => publicar(ANA))).toMatch(/muchos avisos/i);
  });

  it("una clave que no está cae al defecto", async () => {
    await ponerTope('{}');
    await sembrarAvisos(ANA, 30);
    expect(await fallo(() => publicar(ANA))).toMatch(/muchos avisos/i);
  });

  it("y si la fila entera desaparece, tampoco se rompe", async () => {
    await db.exec(`delete from public.system_settings where key = 'limites_de_tasa';`);
    expect(await fallo(() => publicar(ANA))).toBeNull();
    await sembrarAvisos(ANA, 30);
    expect(await fallo(() => publicar(ANA))).toMatch(/muchos avisos/i);
  });
});

describe("la migración se puede volver a aplicar", () => {
  it("dos veces seguidas, sin duplicar el trigger ni reventar", async () => {
    await db.exec(MIG);
    await db.exec(MIG);
    const filas = await q<{ n: number }>(`
      select count(*)::int as n from pg_trigger
       where tgname in ('listings_limite_de_tasa', 'messages_limite_de_tasa')`);
    expect(filas[0].n).toBe(2);
  });

  it("y no pisa unos topes ya configurados", async () => {
    // `on conflict do nothing`: si el superadmin ya los ajustó, un despliegue
    // no puede devolverlos a los de fábrica sin avisar.
    await ponerTope('{"aviso": {"hora": 7, "dia": 7}}');
    await db.exec(MIG);
    const filas = await q<{ v: string }>(`
      select value ->> 'aviso' as v from public.system_settings where key = 'limites_de_tasa'`);
    expect(filas[0].v).toContain('"hora": 7');
  });
});
