// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * 0122 — qué archivos ya no son de ningún aviso.
 *
 * Esto alimenta un borrado AUTOMÁTICO de archivos de usuarios, así que lo que
 * hay que probar no es tanto que encuentre la basura como que **no se lleve por
 * delante nada que sí importa**. Un falso positivo aquí es una foto que no
 * vuelve. De ahí que la mayoría de estas pruebas comprueben lo que NO sale.
 */
const MIG = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/migrations", "0122_adjuntos_huerfanos.sql"),
  "utf8",
);

const USUARIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIVO = "11111111-1111-4111-8111-111111111111";   // aviso que existe
const MUERTO = "22222222-2222-4222-8222-222222222222"; // aviso borrado

let db: PGlite;
const q = <T,>(sql: string) => db.query<T>(sql).then((r) => r.rows);
const huerfanos = async (dias = 3) =>
  (await q<{ name: string }>(`select name from public.adjuntos_huerfanos(${dias}) order by name`))
    .map((r) => r.name);

/** Mete un archivo en el índice de Storage, con la antigüedad que se le diga. */
const archivo = (bucket: string, name: string, dias: number, bytes = 1024) =>
  `insert into storage.objects (bucket_id, name, created_at, metadata) values
     ('${bucket}', '${name}', now() - interval '${dias} days', '{"size": ${bytes}}'::jsonb);`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;

    create table public.listings (id uuid primary key, title text);

    -- Remedo de lo que Supabase monta en el esquema storage.
    create schema storage;
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null,
      name text not null,
      created_at timestamptz not null default now(),
      metadata jsonb
    );
    create or replace function storage.foldername(name text)
    returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
    $$;

    insert into public.listings (id, title) values ('${VIVO}', 'Aviso publicado');
  `);
  await db.exec(MIG);
});

beforeEach(async () => { await db.exec(`delete from storage.objects;`); });

describe("0122 · encuentra lo que sobra", () => {
  it("el archivo de un aviso que ya no existe es basura", async () => {
    await db.exec(archivo("listing-images", `${USUARIO}/${MUERTO}/portada.webp`, 10));
    expect(await huerfanos()).toEqual([`${USUARIO}/${MUERTO}/portada.webp`]);
  });

  it("también los vídeos, que son los que de verdad ocupan", async () => {
    await db.exec(archivo("listing-videos", `${USUARIO}/${MUERTO}/video-1.mp4`, 10, 15 * 1024 * 1024));
    const filas = await q<{ bytes: string }>(`select bytes::text from public.adjuntos_huerfanos(3)`);
    expect(filas).toHaveLength(1);
    expect(Number(filas[0].bytes)).toBe(15 * 1024 * 1024);
  });

  it("y los PDF con la ruta antigua, que no llevaban carpeta propia", async () => {
    // Los documentos se guardaban como `<usuario>/<aviso>.pdf`, sin carpeta.
    // Si solo se mirara el segundo tramo de la ruta, no se limpiarían jamás.
    await db.exec(archivo("listing-docs", `${USUARIO}/${MUERTO}.pdf`, 10));
    expect(await huerfanos()).toEqual([`${USUARIO}/${MUERTO}.pdf`]);
  });

  it("un formulario abandonado hace una semana también cuenta", async () => {
    // La subida anticipada sube la foto en cuanto se elige. Quien se marcha sin
    // publicar deja ese archivo sin ningún aviso al que pertenecer.
    await db.exec(archivo("listing-images", `${USUARIO}/${MUERTO}/foto-1.webp`, 7));
    expect(await huerfanos()).toHaveLength(1);
  });
});

describe("0122 · lo que NO se puede llevar por delante", () => {
  it("los archivos de un aviso que existe se quedan", async () => {
    await db.exec(archivo("listing-images", `${USUARIO}/${VIVO}/portada.webp`, 90));
    expect(await huerfanos()).toEqual([]);
  });

  it("nada recién subido, aunque su aviso no exista todavía", async () => {
    // Este es el seguro que protege al formulario que se está rellenando AHORA:
    // sus archivos ya están arriba y el aviso aún no se ha creado.
    await db.exec(archivo("listing-images", `${USUARIO}/${MUERTO}/portada.webp`, 0));
    await db.exec(archivo("listing-images", `${USUARIO}/${MUERTO}/foto-1.webp`, 2));
    expect(await huerfanos()).toEqual([]);
  });

  it("los avatares no se tocan ni por accidente", async () => {
    await db.exec(archivo("avatars", `${USUARIO}/${MUERTO}.webp`, 400));
    expect(await huerfanos()).toEqual([]);
  });

  it("los CV de las postulaciones tampoco", async () => {
    // Están en otro bucket y su ruta se parece: es justo el error que se evita
    // acotando los buckets en vez de barrer por forma de la ruta.
    await db.exec(archivo("cvs", `${USUARIO}/${MUERTO}/cv.pdf`, 400));
    expect(await huerfanos()).toEqual([]);
  });

  it("ni las imágenes del sitio y de las categorías", async () => {
    await db.exec(archivo("site-assets", `qr-pagos/1.png`, 400));
    await db.exec(archivo("category-images", `${MUERTO}/foto.webp`, 400));
    expect(await huerfanos()).toEqual([]);
  });

  it("una ruta que no lleva un identificador se queda donde está", async () => {
    // Aunque parezca basura. Si no se entiende la ruta, no se borra.
    await db.exec(archivo("listing-images", `${USUARIO}/suelta.webp`, 400));
    await db.exec(archivo("listing-images", `${USUARIO}/carpeta-rara/foto.webp`, 400));
    expect(await huerfanos()).toEqual([]);
  });

  it("el margen de días se puede subir, nunca bajar de uno", async () => {
    await db.exec(archivo("listing-images", `${USUARIO}/${MUERTO}/portada.webp`, 5));
    expect(await huerfanos(3)).toHaveLength(1);
    expect(await huerfanos(30)).toHaveLength(0);
    // Con 0 días se barrería lo que se acaba de subir: el mínimo es un día.
    expect(await huerfanos(0)).toHaveLength(1);
  });
});

describe("0122 · quién puede preguntar", () => {
  it("desde el navegador, nadie: son las rutas de los archivos de todos", async () => {
    for (const rol of ["anon", "authenticated"]) {
      const [{ v }] = await q<{ v: string }>(
        `select has_function_privilege('${rol}', 'public.adjuntos_huerfanos(integer)', 'execute')::text as v`,
      );
      expect(v).toBe("false");
    }
  });

  it("solo la llave de servicio, que es la que corre la limpieza", async () => {
    const [{ v }] = await q<{ v: string }>(
      `select has_function_privilege('service_role', 'public.adjuntos_huerfanos(integer)', 'execute')::text as v`,
    );
    expect(v).toBe("true");
  });
});

describe("0122 · el resumen para vigilarlo", () => {
  it("agrupa por bucket y suma el peso", async () => {
    await db.exec(archivo("listing-images", `${USUARIO}/${MUERTO}/portada.webp`, 10, 200 * 1024));
    await db.exec(archivo("listing-images", `${USUARIO}/${MUERTO}/foto-1.webp`, 10, 300 * 1024));
    await db.exec(archivo("listing-videos", `${USUARIO}/${MUERTO}/video-1.mp4`, 10, 15 * 1024 * 1024));
    const filas = await q<{ bucket_id: string; archivos: string; bytes: string }>(
      `select bucket_id, archivos::text, bytes::text from public.resumen_adjuntos_huerfanos(3) order by bucket_id`,
    );
    expect(filas).toEqual([
      { bucket_id: "listing-images", archivos: "2", bytes: String(500 * 1024) },
      { bucket_id: "listing-videos", archivos: "1", bytes: String(15 * 1024 * 1024) },
    ]);
  });
});
