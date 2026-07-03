// Aplica supabase/backfill-coords.sql a la base de datos.
// Uso:  node supabase/backfill-coords.mjs "<CONNECTION_STRING>"
//   o:  DATABASE_URL=... node supabase/backfill-coords.mjs
// La cadena de conexión (Supabase → Settings → Database → Connection string)
// nunca se guarda: pásala como argumento o variable de entorno.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const conn = process.argv[2] || process.env.DATABASE_URL;
if (!conn) {
  console.error('Falta la cadena de conexión. Uso: node supabase/backfill-coords.mjs "<CONNECTION_STRING>"');
  process.exit(1);
}

const sql = readFileSync(join(__dirname, "backfill-coords.sql"), "utf8");
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

const run = async () => {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    "select count(*) filter (where lat is not null) as con_coords, count(*) as total from public.listings"
  );
  console.log(`Backfill aplicado. Avisos con coordenadas: ${rows[0].con_coords}/${rows[0].total}`);
  await client.end();
};

run().catch((e) => { console.error("Error:", e.message); process.exit(1); });
