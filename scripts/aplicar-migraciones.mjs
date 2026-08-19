// Aplica migraciones a Supabase por la Management API.
//
// En este proyecto no hay service_role key a mano ni `db push`, así que el SQL
// se manda por `POST /v1/projects/{ref}/database/query` con un Personal Access
// Token (Supabase → Account → Access Tokens).
//
//   node scripts/aplicar-migraciones.mjs <TOKEN> [DESDE]
//   node scripts/aplicar-migraciones.mjs sbp_xxx 0107
//
// DESDE es el prefijo del primer archivo a aplicar; por defecto, todos. Las
// migraciones del repo son re-ejecutables, pero acotarlas hace el paso más
// corto y la salida más legible.
//
// El token NO se guarda en ningún sitio: se pasa por argumento y se usa una vez.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROYECTO = "prhbgniwymaaevnisyov";
const __dirname = dirname(fileURLToPath(import.meta.url));

const [, , token, desde = ""] = process.argv;
if (!token) {
  console.error("Falta el token. Uso: node scripts/aplicar-migraciones.mjs <TOKEN> [DESDE]");
  process.exit(1);
}

const dir = join(__dirname, "..", "supabase", "migrations");
const archivos = readdirSync(dir)
  .filter((f) => f.endsWith(".sql") && f >= desde)
  .sort();

if (!archivos.length) {
  console.error(`No hay migraciones desde "${desde}".`);
  process.exit(1);
}

console.log(`Se aplicarán ${archivos.length} migraciones al proyecto ${PROYECTO}:\n`);

let fallos = 0;
for (const archivo of archivos) {
  const sql = readFileSync(join(dir, archivo), "utf8");
  process.stdout.write(`  ${archivo} … `);
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (res.ok) {
      console.log("ok");
    } else {
      // Se sigue con las demás: son independientes entre sí y parar en la
      // primera dejaría la base a medio camino sin saber qué más falta.
      fallos++;
      const detalle = await res.text();
      console.log(`ERROR ${res.status}`);
      console.log(`    ${detalle.slice(0, 300)}`);
    }
  } catch (e) {
    fallos++;
    console.log(`ERROR de red: ${e instanceof Error ? e.message : e}`);
  }
}

console.log(
  fallos === 0
    ? `\nListo: ${archivos.length} migraciones aplicadas.`
    : `\nTerminado con ${fallos} error(es) de ${archivos.length}. Revisa el detalle de arriba.`,
);
process.exit(fallos === 0 ? 0 : 1);
