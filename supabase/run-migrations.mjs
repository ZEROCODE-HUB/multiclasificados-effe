// Ejecuta todas las migraciones SQL de supabase/migrations en orden.
// Uso:  node supabase/run-migrations.mjs "<CONNECTION_STRING>"
//   o:  DATABASE_URL=... node supabase/run-migrations.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const conn = process.argv[2] || process.env.DATABASE_URL;
if (!conn) {
  console.error("Falta la cadena de conexión. Uso: node supabase/run-migrations.mjs \"<CONNECTION_STRING>\"");
  process.exit(1);
}

const dir = join(__dirname, "migrations");
// Arg opcional 3: prefijo mínimo de archivo a ejecutar (ej. "0009" para solo nuevas).
const minPrefix = process.argv[3] || "";
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => f >= minPrefix)
  .sort();

const client = new pg.Client({
  connectionString: conn,
  ssl: { rejectUnauthorized: false },
});

const run = async () => {
  await client.connect();
  console.log(`Conectado. Aplicando ${files.length} migraciones...\n`);
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`→ ${file} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("commit");
      console.log("OK");
    } catch (err) {
      await client.query("rollback");
      console.log("ERROR");
      console.error(`\n   ${err.message}\n`);
      await client.end();
      process.exit(1);
    }
  }
  console.log("\n✅ Todas las migraciones se aplicaron correctamente.");
  await client.end();
};

run().catch(async (e) => {
  console.error("Fallo de conexión:", e.message);
  process.exit(1);
});
