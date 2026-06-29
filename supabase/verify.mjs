import pg from "pg";
const conn = process.argv[2];
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();

const q = async (label, sql) => {
  const r = await client.query(sql);
  console.log(`\n== ${label} ==`);
  console.table(r.rows);
};

await q("Tablas públicas",
  `select table_name from information_schema.tables
   where table_schema='public' and table_type='BASE TABLE' order by table_name`);

await q("RLS habilitado",
  `select relname as tabla, relrowsecurity as rls
   from pg_class where relnamespace='public'::regnamespace and relkind='r'
   and relrowsecurity = true order by relname`);

await q("Conteo de políticas RLS",
  `select count(*)::int as total_policies from pg_policies where schemaname='public'`);

await q("Enums",
  `select t.typname as enum, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as valores
   from pg_type t join pg_enum e on e.enumtypid=t.oid
   where t.typnamespace='public'::regnamespace group by t.typname order by t.typname`);

await q("Categorías (seed)", `select id, name, icon from public.categories order by sort_order`);

await q("Pricing activo", `select base, desc_por_aviso, saltos, extras from public.pricing_settings where is_active`);

await q("Buckets de Storage", `select id, public from storage.buckets order by id`);

await q("Trigger de alta de usuario",
  `select tgname from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal`);

await client.end();
