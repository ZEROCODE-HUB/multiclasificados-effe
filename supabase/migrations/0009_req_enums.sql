-- =====================================================================
-- 0009_req_enums.sql — Nuevos enums para REQ-05 / REQ-09 / REQ-10
-- (idempotente)
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'message_status') then
    create type public.message_status as enum ('sent', 'delivered', 'read');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('in_app', 'push', 'email');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_target_type') then
    create type public.report_target_type as enum ('listing', 'user');
  end if;
end $$;
