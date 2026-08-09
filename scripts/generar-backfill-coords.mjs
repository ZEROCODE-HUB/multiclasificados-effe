// Genera supabase/migrations/0081_backfill_listing_coords.sql a partir del
// catálogo de zonas.
//
//   node scripts/generar-backfill-coords.mjs
//
// Los avisos publicados antes del selector de zonas tienen la ubicación escrita
// a mano y muchos sin coordenadas — y un aviso sin coordenadas NO aparece en las
// búsquedas por cercanía. Esto los cruza contra el catálogo y les pone el centro
// de su zona.
//
// Se reconocen tres formas de haberlo escrito:
//   · la etiqueta tal cual        → "Miraflores, Lima"
//   · las dos partes al revés     → "Lima, Miraflores"
//   · solo el nombre, si no se repite en el país → "Chachapoyas"
// Un nombre repetido ("Bellavista" está en Callao, San Martín, Piura…) se deja
// sin tocar a propósito: mandar el aviso a la región equivocada sería peor que
// dejarlo como está.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "supabase", "migrations", "0081_backfill_listing_coords.sql");

// Se lee el .ts generado en vez de importarlo: Node no carga TypeScript. El
// catálogo va en formato compacto, una línea por distrito.
const fuente = await fs.readFile(path.join(RAIZ, "src", "data", "zonas.ts"), "utf8");
const crudo = fuente.match(/const CRUDO = `([\s\S]*?)`;/);
if (!crudo) throw new Error("No se pudo leer el catálogo de src/data/zonas.ts");

const ZONAS = crudo[1].split("\n").map((linea) => {
  const [id, nombre, provincia, departamento, lat, lng, niveles] = linea.split("|");
  return { id, nombre, provincia, departamento, lat, lng, niveles: niveles === "3" ? 3 : 2 };
});

// La MISMA normalización que hace el SQL de abajo: sin tildes, en minúsculas,
// sin signos, y con las palabras ORDENADAS alfabéticamente. Ordenarlas hace que
// "Miraflores, Lima", "Lima, Miraflores" y "miraflores lima" caigan en la misma
// clave, así que basta una por zona en vez de una por cada forma de escribirla.
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");

// La misma etiqueta que compone etiquetaZona() en src/lib/zonas.ts.
const etiqueta = (z) =>
  [...new Set([z.nombre, z.provincia, z.departamento].filter(Boolean))].slice(0, z.niveles).join(", ");

// Las claves van en DOS niveles de prioridad, y no todas revueltas:
//
//   1. La etiqueta oficial de la zona ("Miraflores, Lima"). Es única por
//      construcción y nunca se descarta.
//   2. Formas alternativas de escribirlo: distrito + departamento saltándose la
//      provincia ("Miraflores, Lima" para el Miraflores de Yauyos, que también
//      es del departamento de Lima) y el nombre a secas.
//
// Sin esa separación pasaba justo lo peor: la alternativa del Miraflores de
// Yauyos chocaba con la etiqueta del Miraflores de Lima, las dos se descartaban
// por ambiguas, y el distrito más poblado del país se quedaba sin reconocer.
// Ahora una alternativa nunca puede pisar una etiqueta, y si dos alternativas
// chocan entre sí se van las dos.
const claves = new Map();
for (const z of ZONAS) claves.set(norm(etiqueta(z)), z);

const alternas = new Map();
const ambiguas = new Set();
const alternativa = (clave, zona) => {
  const k = norm(clave);
  if (!k || claves.has(k)) return; // una etiqueta oficial siempre manda
  const previa = alternas.get(k);
  if (previa && previa.id !== zona.id) ambiguas.add(k);
  else alternas.set(k, zona);
};

for (const z of ZONAS) {
  if (z.departamento && z.departamento !== z.nombre) alternativa(`${z.nombre} ${z.departamento}`, z);
}
// El nombre a secas solo vale si no se repite en el país: hay "Bellavista" en
// varias regiones y mandar el aviso a la equivocada sería peor que no tocarlo.
const cuentaNombres = new Map();
for (const z of ZONAS) cuentaNombres.set(norm(z.nombre), (cuentaNombres.get(norm(z.nombre)) ?? 0) + 1);
for (const z of ZONAS) if (cuentaNombres.get(norm(z.nombre)) === 1) alternativa(z.nombre, z);

for (const k of ambiguas) alternas.delete(k);
for (const [k, z] of alternas) claves.set(k, z);

const filas = [...claves.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([clave, z]) => `    (${sql(clave)}, ${sql(etiqueta(z))}, ${z.lat}, ${z.lng})`)
  .join(",\n");

function sql(t) {
  return `'${t.replace(/'/g, "''")}'`;
}

await fs.writeFile(
  SALIDA,
  `-- =====================================================================
-- 0081_backfill_listing_coords.sql — coordenadas a los avisos que no las tienen.
--
-- GENERADO por scripts/generar-backfill-coords.mjs desde src/data/zonas.ts.
-- Para regenerarlo tras cambiar el catálogo, volver a ejecutar ese script.
--
-- Antes del selector de zonas, marcar el punto en el mapa era OPCIONAL al
-- publicar, así que hay avisos activos sin lat/lng — y sin coordenadas un aviso
-- no aparece en ninguna búsqueda por cercanía. Aquí se cruza el texto que
-- escribió el anunciante contra el catálogo y se les pone el centro de su zona.
--
-- Alcance deliberado:
--   · SOLO avisos activos (los vencidos o en borrador no se tocan).
--   · SOLO los que no tienen coordenadas: a quien marcó su punto exacto no se
--     le pisa nada.
--   · SOLO cuando el texto identifica la zona sin ambigüedad. Los nombres que
--     se repiten en varias regiones ("Bellavista") se quedan sin tocar: mandar
--     el aviso a otra región sería peor que dejarlo como está.
--
-- Al final deja un aviso (RAISE NOTICE) con cuántos quedaron sin resolver, para
-- saber si vale la pena repasarlos a mano.
-- Idempotente: al segundo pase ya no hay filas sin coordenadas que actualizar.
-- =====================================================================

do $$
declare
  v_actualizados int;
  v_pendientes   int;
begin
  create temporary table tmp_zonas (
    clave    text primary key,
    etiqueta text not null,
    lat      numeric(9,6) not null,
    lng      numeric(9,6) not null
  ) on commit drop;

  insert into tmp_zonas (clave, etiqueta, lat, lng) values
${filas};

  with textos as (
    -- Clave del texto del aviso: sin tildes, en minúsculas, sin signos y con las
    -- palabras ORDENADAS. Así "Miraflores, Lima", "Lima, Miraflores" y
    -- "miraflores lima" dan todas la misma clave y basta una fila por zona.
    select
      l.id,
      (select string_agg(p, ' ' order by p)
         from unnest(string_to_array(
                regexp_replace(
                  lower(translate(coalesce(l.location, ''),
                                  'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
                  '[^a-z0-9]+', ' ', 'g'),
                ' ')) as p
        where p <> '') as clave
    from public.listings l
    where l.status = 'active'
      and (l.lat is null or l.lng is null)
  ),
  candidatos as (
    select t.id, z.etiqueta, z.lat, z.lng
    from textos t
    join tmp_zonas z on z.clave = t.clave
  )
  update public.listings l
     set lat = c.lat,
         lng = c.lng,
         -- El texto se deja escrito igual que lo escribe ahora el selector, para
         -- que al editar el aviso su zona salga ya elegida.
         location = c.etiqueta
    from candidatos c
   where l.id = c.id;

  get diagnostics v_actualizados = row_count;

  select count(*) into v_pendientes
    from public.listings
   where status = 'active' and (lat is null or lng is null);

  raise notice 'Avisos con coordenadas nuevas: %', v_actualizados;
  raise notice 'Avisos activos que siguen sin coordenadas: % (su ubicación no coincide con ninguna zona; hay que corregirlos a mano)', v_pendientes;
end $$;
`,
  "utf8",
);

console.log(`${claves.size} claves de búsqueda (${ambiguas.size} descartadas por ambiguas) → ${path.relative(RAIZ, SALIDA)}`);
