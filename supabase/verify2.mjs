import pg from "pg";
const conn = process.argv[2];
const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (label, sql) => {
  const r = await client.query(sql);
  console.log(`\n== ${label} ==`);
  console.table(r.rows);
};

await q("Tablas nuevas (REQ)",
  `select table_name from information_schema.tables
   where table_schema='public' and table_name in
   ('subcategories','reviews','notification_preferences') order by table_name`);

await q("Funciones / RPC nuevas",
  `select proname from pg_proc where pronamespace='public'::regnamespace
   and proname in ('search_listings','toggle_favorite','track_event','mark_messages_read',
   'mark_messages_delivered','publish_listing','run_saved_search_alerts','expire_listings',
   'notify_user','recalc_user_rating','enforce_review_eligibility') order by proname`);

await q("Columnas nuevas clave",
  `select table_name, column_name from information_schema.columns
   where table_schema='public' and
   ((table_name='messages' and column_name in ('status','delivered_at')) or
    (table_name='listings' and column_name='subcategory_id') or
    (table_name='listing_events' and column_name='visitor_key') or
    (table_name='reports' and column_name in ('target_type','target_user_id')) or
    (table_name='saved_searches' and column_name='last_run_at'))
   order by table_name, column_name`);

await q("Subcategorías sembradas",
  `select category_id, count(*)::int as subcats from public.subcategories group by category_id order by category_id`);

await q("Jobs programados (pg_cron)",
  `select jobname, schedule, active from cron.job order by jobname`);

await q("Vista listing_stats existe",
  `select count(*)::int as col_count from information_schema.columns where table_schema='public' and table_name='listing_stats'`);

await client.end();
