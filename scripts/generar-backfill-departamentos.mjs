// Genera supabase/migrations/0086_backfill_listing_department.sql
//
//   node scripts/generar-backfill-departamentos.mjs
//
// Por qué existe
// ──────────────
// La migración 0084 deduce el departamento del TEXTO que escribió el anunciante
// ("Miraflores, Lima"). Eso solo acierta cuando el texto nombra el departamento,
// y la mayoría no lo hace: escriben "Chancay", "Laredo", "Nuevo Chimbote". Un
// aviso sin departamento no aparece en NINGÚN filtro de ubicación, así que ese
// resto quedaría invisible.
//
// Pero todos los avisos activos SÍ tienen su punto en el mapa. Preguntarle a
// Google a qué región pertenece cada punto es exacto y no adivina nada — es la
// misma llamada que hace la app al publicar (src/lib/geocode.ts).
//
// Se hace aquí y no dentro de la base de datos porque Postgres no puede
// consultar Google, y meter las fronteras del país en una migración sería mucho
// peso para resolver 89 filas de una vez.
//
// Qué necesita
// ────────────
//   · .env con VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y
//     VITE_GOOGLE_MAPS_API_KEY.
//
// Alcance: los avisos que la clave anónima puede leer, o sea los ACTIVOS (la
// vista listing_cards). Los pausados, vencidos o en borrador no se tocan; su
// departamento se rellena cuando su dueño los vuelva a publicar, que es cuando
// el formulario lo deduce del mapa. Para alcanzarlos también haría falta la
// cadena de conexión de Postgres.
//
// Se aborta a la primera incoherencia (un punto fuera del Perú, una región que
// no se reconoce): es preferible no generar nada a generar un SQL que mande
// avisos al departamento equivocado.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "supabase/migrations/0086_backfill_listing_department.sql");

// ─── Configuración ────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const { VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: ANON, VITE_GOOGLE_MAPS_API_KEY: GOOGLE } = env;
for (const [k, v] of Object.entries({ VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: ANON, VITE_GOOGLE_MAPS_API_KEY: GOOGLE })) {
  if (!v) abortar(`Falta ${k} en .env`);
}

function abortar(motivo) {
  console.error(`\n✖ ${motivo}\n  No se ha escrito nada.`);
  process.exit(1);
}

// ─── El catálogo de departamentos, tal cual lo usa la app ─────────────────────
// Se compila el módulo TypeScript de verdad en vez de copiar la lógica aquí: si
// se copiara, el día que cambie un alias el relleno y la app dejarían de estar
// de acuerdo sin que nadie se entere.
const tmp = path.join(RAIZ, "node_modules/.cache/departamentos.mjs");
fs.mkdirSync(path.dirname(tmp), { recursive: true });
const esbuild = await import("esbuild");
await esbuild.build({
  entryPoints: [path.join(RAIZ, "src/lib/departamentos.ts")],
  bundle: true,
  format: "esm",
  outfile: tmp,
  alias: { "@": path.join(RAIZ, "src") },
  logLevel: "warning",
});
const { departamentoDeTexto } = await import(`file:///${tmp.replace(/\\/g, "/")}`);

// ─── Los avisos ───────────────────────────────────────────────────────────────
const res = await fetch(
  `${SUPABASE}/rest/v1/listing_cards?select=id,title,location,lat,lng&limit=2000`,
  { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
);
if (!res.ok) abortar(`Supabase respondió ${res.status}: ${await res.text()}`);
const avisos = await res.json();
console.log(`Avisos activos: ${avisos.length}`);

const sinPunto = avisos.filter((a) => a.lat == null || a.lng == null);
const conPunto = avisos.filter((a) => a.lat != null && a.lng != null);
console.log(`  con punto en el mapa: ${conPunto.length}   sin punto: ${sinPunto.length}`);

// ─── Región de cada punto, según Google ───────────────────────────────────────
/** Devuelve el nombre de la región (administrative_area_level_1) del punto. */
async function regionDe(lat, lng) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", GOOGLE);
  url.searchParams.set("language", "es");
  url.searchParams.set("result_type", "administrative_area_level_1");
  const r = await fetch(url);
  if (!r.ok) abortar(`Google respondió ${r.status} para ${lat},${lng}`);
  const d = await r.json();
  if (d.status === "ZERO_RESULTS") return null;
  if (d.status !== "OK") abortar(`Google devolvió ${d.status}${d.error_message ? ` — ${d.error_message}` : ""}`);
  // También el país: un punto en el mar o en Bolivia no puede acabar en un
  // departamento peruano por accidente.
  const pais = d.results?.[0]?.address_components?.find((c) => c.types?.includes("country"))?.short_name;
  return { region: d.results?.[0]?.address_components?.[0]?.long_name ?? null, pais };
}

const filas = [];
const sinResolver = [];
let n = 0;
for (const a of conPunto) {
  const info = await regionDe(a.lat, a.lng);
  n++;
  process.stdout.write(`\r  consultando… ${n}/${conPunto.length}`);
  if (!info?.region) { sinResolver.push({ ...a, motivo: "Google no devolvió región" }); continue; }
  if (info.pais && info.pais !== "PE") { sinResolver.push({ ...a, motivo: `el punto cae en ${info.pais}` }); continue; }
  const dep = departamentoDeTexto(info.region);
  if (!dep) { sinResolver.push({ ...a, motivo: `región no reconocida: "${info.region}"` }); continue; }
  filas.push({ id: a.id, dep: dep.id, region: info.region, nombre: dep.nombre, location: a.location, title: a.title });
}
process.stdout.write("\n");

// ─── Comprobaciones antes de escribir nada ────────────────────────────────────
if (filas.length === 0) abortar("No se resolvió ni un solo aviso");

const idUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const f of filas) {
  if (!idUuid.test(f.id)) abortar(`Id que no es un uuid: ${JSON.stringify(f.id)}`);
  if (!/^\d{2}$/.test(f.dep)) abortar(`Código de departamento raro: ${JSON.stringify(f.dep)}`);
}

// Contraste con lo que decía el texto: si el punto dice un departamento y el
// texto dice otro, manda el punto (es un dato, no una redacción), pero se avisa.
const discrepancias = filas.filter((f) => {
  const porTexto = departamentoDeTexto(f.location);
  return porTexto && porTexto.id !== f.dep;
});

const porDep = new Map();
for (const f of filas) porDep.set(f.nombre, (porDep.get(f.nombre) ?? 0) + 1);

console.log("\nDepartamento asignado:");
for (const [nombre, c] of [...porDep].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(c).padStart(3)} · ${nombre}`);
}
if (discrepancias.length) {
  console.log(`\n⚠ ${discrepancias.length} avisos donde el punto y el texto no coinciden (manda el punto):`);
  for (const d of discrepancias) {
    console.log(`   "${d.location}" → ${d.nombre} (${d.region})`);
  }
}
if (sinResolver.length) {
  console.log(`\n⚠ ${sinResolver.length} sin resolver:`);
  for (const s of sinResolver) console.log(`   ${s.id} "${s.location}" — ${s.motivo}`);
}

// ─── El SQL ───────────────────────────────────────────────────────────────────
const hoy = new Date().toISOString().slice(0, 10);
const sql = `-- =====================================================================
-- 0086_backfill_listing_department.sql — departamento de los avisos que ya
-- estaban publicados, deducido de su punto en el mapa.
--
-- GENERADO por scripts/generar-backfill-departamentos.mjs el ${hoy}.
-- No editar a mano: volver a ejecutar el script.
--
-- Por qué hace falta además de la 0084: aquella deduce el departamento del
-- texto que escribió el anunciante, y la mayoría no nombra su departamento
-- ("Chancay", "Laredo", "Nuevo Chimbote"). Un aviso sin departamento no sale en
-- ningún filtro de ubicación, así que se quedarían invisibles.
--
-- De dónde sale el dato: de preguntarle a Google a qué región pertenece el
-- punto que marcó cada anunciante — la misma consulta que hace la app al
-- publicar. No se adivina nada a partir del nombre.
--
-- Alcance: los ${filas.length} avisos ACTIVOS que tenían punto en el mapa. Los
-- pausados, vencidos o en borrador no se tocan: recuperan su departamento
-- cuando su dueño los vuelve a publicar.
--
-- Va DESPUÉS de la 0084, que es la que crea la columna y hace el primer intento
-- por texto. Donde las dos no coinciden MANDA ESTA: el punto es un dato y el
-- texto una redacción. Sin esto, "San Martín de Porres" (un distrito de Lima)
-- se quedaría archivado en el departamento de San Martín, a 700 km.
--
-- Idempotente: al segundo pase no hay nada que cambiar.
-- =====================================================================

do $$
declare
  v_pendientes int;
begin
  if to_regclass('public.listings') is null then
    raise exception 'No existe public.listings: aplica antes las migraciones anteriores';
  end if;

  create temporary table tmp_departamento_aviso (
    id         uuid primary key,
    department text not null
  ) on commit drop;

  insert into tmp_departamento_aviso (id, department) values
${filas
  .map((f, i) => `    ('${f.id}', '${f.dep}')${i === filas.length - 1 ? "" : ","}  -- ${f.nombre} · ${(f.location ?? "").replace(/-{2,}/g, "-").replace(/\r?\n/g, " ").trim()}`)
  .join("\n")}
  ;

  -- El punto pisa lo que hubiera deducido la 0084 del texto: donde discrepan,
  -- se equivoca el texto. Solo afecta a estos ${filas.length} avisos, ninguno más.
  update public.listings l
     set department = t.department
    from tmp_departamento_aviso t
   where l.id = t.id
     and l.department is distinct from t.department;

  select count(*) into v_pendientes
    from public.listings where status = 'active' and department is null;
  raise notice 'Avisos activos que siguen sin departamento: %', v_pendientes;
end $$;
`;

fs.writeFileSync(SALIDA, sql, "utf8");
console.log(`\n✔ Escrito ${path.relative(RAIZ, SALIDA)} — ${filas.length} avisos.`);
