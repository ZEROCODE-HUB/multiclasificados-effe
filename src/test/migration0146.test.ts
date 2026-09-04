// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0146 — descripción con negrita y color.
 *
 * LO IMPORTANTE NO ES QUE SE GUARDE EL FORMATO, sino que nada de lo que ya
 * funcionaba se entere. `description` la leen cinco consumidores y solo la ficha
 * quiere ver el formato:
 *
 *   · el buscador, que indexa `title || description` y además hace `ilike`;
 *   · la vista previa de WhatsApp, que recorta la descripción a 200 caracteres;
 *   · la tarjeta del listado;
 *   · el contador de 2000 caracteres;
 *   · y la ficha, que es la única que lo quiere.
 *
 * Por eso el formato vive en otra columna y `description` se DERIVA de él: lo
 * que se busca es siempre, por construcción, lo que se ve.
 */
const lee = (f: string) =>
  fs.readFileSync(path.resolve(__dirname, "../../supabase/migrations", f), "utf8");

const MIG = lee("0146_descripcion_con_formato.sql");
/** La 0147 es la que reparte los permisos que la 0146 se dejó. */
const PERMISOS = lee("0147_las_funciones_de_la_descripcion_nacen_cerradas.sql");

const DUENO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);

/** Crea un aviso y devuelve cómo quedó su descripción. */
async function guardar(rich: string | null, plano = "sin formato") {
  await db.exec(`
    delete from public.listings;
    insert into public.listings (owner_id, title, description, description_rich, status)
    values ('${DUENO}', 'Depa', '${plano}',
            ${rich === null ? "null" : `'${rich}'::jsonb`}, 'active');
  `);
  const [f] = await q<{ description: string; rich: unknown }>(
    "select description, description_rich as rich from public.listings",
  );
  return f;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;");

  await db.exec(`
    create type listing_status as enum ('draft','pending','active','paused','expired','sold','rejected');
    create table public.profiles (
      id uuid primary key, full_name text, rating numeric, verified boolean default false
    );
    create table public.listings (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references public.profiles(id),
      title text, description text, price numeric default 0, currency text default 'PEN',
      condition text, category_id text, subcategory_id text, location text,
      lat numeric, lng numeric, status listing_status default 'draft',
      featured boolean default false, urgent boolean default false,
      confidential boolean default false, views integer default 0,
      published_at timestamptz, created_at timestamptz default now(),
      expires_at timestamptz, department text, country text
    );
    create table public.listing_images (
      listing_id uuid, url text, sort_order integer
    );
    create table public.listing_videos (listing_id uuid);

    insert into public.profiles (id, full_name) values ('${DUENO}', 'Ana');

    -- La vista, tal y como está antes de esta migración: la 0146 la reemplaza
    -- para añadirle una columna.
    create view public.listing_cards as
      select l.id, l.owner_id, l.title, l.description, l.price, l.currency, l.condition,
             l.category_id, l.subcategory_id, l.location, l.lat, l.lng, l.status,
             l.featured, l.urgent, l.confidential, l.views, l.published_at, l.created_at,
             l.expires_at,
             p.full_name as advertiser, p.rating as advertiser_rating,
             (select li.url from public.listing_images li
               where li.listing_id = l.id order by li.sort_order limit 1) as image_url,
             l.department, coalesce(p.verified, false) as advertiser_verified,
             coalesce(l.country, 'PE'::text) as country,
             ((select count(*) from public.listing_videos v where v.listing_id = l.id))::integer as video_count
        from public.listings l join public.profiles p on p.id = l.owner_id
       where l.status = 'active'::listing_status;

    -- Los permisos que la vista ya tenía. Si la migración la recreara con
    -- DROP + CREATE, se perderían y el buscador devolvería vacío (0136).
    grant select on public.listing_cards to anon, authenticated;
  `);
  await db.exec(MIG);

  // ── SE REPRODUCE A PROPÓSITO EL MUNDO DE LA 0104 ──
  //
  // En Supabase, desde la 0104, una función nueva de `public` NACE SIN
  // EXECUTE: se le revocó a PUBLIC el permiso por defecto. PGlite es un
  // Postgres limpio y las crea abiertas, así que sin esta línea la prueba
  // de permisos daría verde AUNQUE FALTARAN LOS GRANTS — que es justo el
  // fallo que llegó a producción.
  //
  // Se revoca a mano y no con `alter default privileges`, porque eso
  // último PGlite lo acepta y NO lo aplica: se comprobó, y dejaba la
  // prueba en verde con la 0147 desactivada.
  await db.exec("revoke execute on all functions in schema public from public;");

  // Y ahora la migración que reparte los permisos que faltaban.
  await db.exec(PERMISOS);
  // La RLS decide QUIÉN escribe; aquí se prueba otra cosa, así que el rol
  // necesita el privilegio de tabla para llegar siquiera al CHECK.
  await db.exec("grant select, insert, update on public.listings to authenticated;");
});

beforeEach(() => db.exec("delete from public.listings"));

describe("el texto plano se DERIVA del formato", () => {
  it("no se confía en lo que mande el cliente", () => {
    // Se guarda a propósito una descripción que NO coincide con el formato: la
    // base tiene que quedarse con la del formato. Si se confiara en el cliente,
    // el buscador podría enseñar algo distinto de lo que dice la ficha.
    const f = guardar('[{"t":"Depa "},{"t":"amoblado","b":true}]', 'MENTIRA');
    return f.then((r) => expect(r.description).toBe("Depa amoblado"));
  });

  it("y se actualiza al cambiar el formato", async () => {
    await guardar('[{"t":"uno"}]');
    await db.exec(`update public.listings set description_rich = '[{"t":"dos","b":true}]'::jsonb`);
    const [r] = await q<{ description: string }>("select description from public.listings");
    expect(r.description).toBe("dos");
  });

  it("sin formato, la descripción se queda tal cual", async () => {
    // Es el caso de los avisos que ya existen: no hay nada que migrar.
    const r = await guardar(null, "Descripción de toda la vida");
    expect(r.description).toBe("Descripción de toda la vida");
    expect(r.rich).toBeNull();
  });

  it("un formato sin texto se descarta en vez de vaciar la descripción", async () => {
    const r = await guardar('[{"t":"   "}]', "algo");
    expect(r.rich).toBeNull();
    expect(r.description).toBe("algo");
  });

  it("y el tope de 2000 se mide sobre el TEXTO, no sobre el JSON", async () => {
    // Las marcas no le comen caracteres al anunciante.
    const largo = "a".repeat(1999);
    await expect(guardar(`[{"t":"${largo}"},{"t":"bb","b":true}]`))
      .rejects.toThrow(/2000 caracteres/i);
    const r = await guardar(`[{"t":"${largo}"},{"t":"b","b":true}]`);
    expect(r.description).toHaveLength(2000);
  });
});

describe("qué formato se admite", () => {
  // El trigger da un mensaje legible; el CHECK es la segunda barrera. Se
  // aceptan los dos textos porque cuál salte depende de cuál mire primero.
  const rechaza = (rich: string) =>
    expect(guardar(rich)).rejects.toThrow(/no es válido|check constraint|violates/i);

  it("acepta las dos marcas y los cuatro colores", async () => {
    for (const c of ["azul", "naranja", "verde", "rojo"]) {
      const r = await guardar(`[{"t":"x","b":true,"c":"${c}"}]`);
      expect(r.rich).toBeTruthy();
    }
  });

  it("rechaza un color que no es de la paleta", async () => {
    // Un hexadecimal libre acaba en amarillo sobre blanco, que no se lee.
    await rechaza('[{"t":"x","c":"fucsia"}]');
    await rechaza('[{"t":"x","c":"#ff0000"}]');
  });

  it("rechaza claves desconocidas", async () => {
    // Hoy el renderizador las ignoraría; el de mañana podría mirarlas.
    await rechaza('[{"t":"x","onclick":"alert(1)"}]');
    await rechaza('[{"t":"x","style":"color:red"}]');
  });

  it("rechaza lo que no es una lista de fragmentos", async () => {
    await rechaza('"un texto suelto"');
    await rechaza('{"t":"un objeto"}');
    await rechaza("123");
    await rechaza("[]");
    await rechaza('[{"sin_texto":true}]');
  });

  it("rechaza un `b` que no sea `true`", async () => {
    // `false` significa lo mismo que no ponerlo, y dos formas de decir lo mismo
    // acaban divergiendo.
    await rechaza('[{"t":"x","b":false}]');
  });

  it("rechaza más fragmentos de la cuenta", async () => {
    // Sin tope, 2000 caracteres podrían llegar partidos en 2000 nodos y cada
    // ficha pintaría 2000 elementos.
    const muchos = Array.from({ length: 301 }, (_, i) => `{"t":"${i % 10}"}`).join(",");
    await rechaza(`[${muchos}]`);
  });

  it("la validación se comprueba en la BASE y no solo en el navegador", () => {
    // Cualquiera con la llave anónima puede escribir en sus propios avisos: la
    // RLS dice QUIÉN escribe, no QUÉ.
    expect(MIG).toContain("listings_description_rich_check");
  });
});

describe("nada de lo que ya funcionaba se entera", () => {
  it("el buscador encuentra una palabra que está en negrita", () => {
    // LA REGRESIÓN MÁS PROBABLE de todo esto. Si el formato viviera dentro de
    // `description`, «amoblado» estaría partido por el marcado y no se
    // encontraría.
    return guardar('[{"t":"Depa "},{"t":"amoblado","b":true},{"t":" en Lima"}]')
      .then(() => q<{ n: number }>(`
        select count(*)::int as n from public.listing_cards
         where to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(description,''))
               @@ plainto_tsquery('spanish', 'amoblado')
      `))
      .then(([r]) => expect(r.n).toBe(1));
  });

  it("y también con el `ilike` que usa la búsqueda parcial", async () => {
    await guardar('[{"t":"Casa "},{"t":"grande","c":"rojo"}]');
    const [r] = await q<{ n: number }>(
      "select count(*)::int as n from public.listing_cards where description ilike '%grande%'",
    );
    expect(r.n).toBe(1);
  });

  it("la descripción que ve WhatsApp no lleva NADA de marcado", async () => {
    // `api/og-aviso.ts` recorta esta columna y la mete en una meta.
    await guardar('[{"t":"Oferta","b":true,"c":"rojo"},{"t":" del mes"}]');
    const [r] = await q<{ description: string }>(
      "select description from public.listing_cards",
    );
    expect(r.description).toBe("Oferta del mes");
    expect(r.description).not.toMatch(/[<>{}]|span|font|true/);
  });

  it("la vista conserva sus permisos", async () => {
    // La migración usa `create or replace` y añade la columna AL FINAL, que es
    // la única forma de no perderlos. Un DROP + CREATE dejaría el buscador
    // entero devolviendo vacío hasta que alguien se acordara del grant.
    for (const rol of ["anon", "authenticated"]) {
      const [{ ok }] = await q<{ ok: boolean }>(
        `select has_table_privilege('${rol}', 'public.listing_cards', 'select') as ok`,
      );
      expect(ok).toBe(true);
    }
  });

  it("y ahora expone el formato, para que la ficha pueda pintarlo", async () => {
    await guardar('[{"t":"x","b":true}]');
    const [r] = await q<{ rich: unknown }>(
      "select description_rich as rich from public.listing_cards",
    );
    expect(r.rich).toEqual([{ t: "x", b: true }]);
  });
});

describe("y el que escribe puede EJECUTAR lo que valida", () => {
  /**
   * LA PRUEBA QUE FALTABA, Y QUE COSTÓ UNA CAÍDA EN PRODUCCIÓN.
   *
   * La 0146 creó sus funciones sin `grant execute`. Como en esta base una
   * función nueva nace cerrada (0104), el resultado fue:
   *
   *     ERROR: 42501: permission denied for function texto_con_formato_valido
   *
   * Y no falló «guardar una descripción con negrita»: falló TODO lo que toca un
   * aviso. Porque quien llama a la función no es el formulario sino la
   * restricción, y un CHECK se evalúa en CADA insert y en CADA update de la
   * fila, mire la columna que mire.
   */
  const comoAnunciante = async (sql: string) => {
    await db.exec("set role authenticated");
    try {
      await db.exec(sql);
    } finally {
      await db.exec("reset role");
    }
  };

  it("puede crear un aviso SIN formato", async () => {
    // El caso más común de todos, y también fallaba: el CHECK corre igual
    // aunque la columna venga a null.
    await expect(comoAnunciante(`
      insert into public.listings (owner_id, title, description, status)
      values ('${DUENO}', 'Depa', 'texto plano', 'draft');
    `)).resolves.not.toThrow();
  });

  it("puede crear un aviso CON formato", async () => {
    await expect(comoAnunciante(`
      insert into public.listings (owner_id, title, description, description_rich, status)
      values ('${DUENO}', 'Depa', 'x', '[{"t":"Depa ","b":true}]'::jsonb, 'draft');
    `)).resolves.not.toThrow();
  });

  it("y puede PAUSAR uno que ya existe, que no tiene nada que ver con el formato", async () => {
    // Este es el que enseña el tamaño real del fallo: pausar, reactivar,
    // adjuntar el PDF o moderar desde el panel no tocan la descripción y
    // fallaban todos igual.
    await guardar(null, "sin formato");
    await expect(comoAnunciante(
      "update public.listings set status = 'paused';",
    )).resolves.not.toThrow();
  });

  it("la 0147 reparte el permiso a los dos roles del cliente", async () => {
    for (const rol of ["anon", "authenticated"]) {
      for (const fn of ["texto_con_formato_valido(jsonb)", "texto_plano_del_formato(jsonb)"]) {
        const [{ ok }] = await q<{ ok: boolean }>(
          `select has_function_privilege('${rol}', 'public.${fn}', 'execute') as ok`,
        );
        expect(ok, `${rol} no puede ejecutar ${fn}`).toBe(true);
      }
    }
  });
});
