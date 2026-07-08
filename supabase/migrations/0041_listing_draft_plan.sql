-- Plan de publicación elegido para un aviso que todavía NO se ha pagado.
--
-- Hasta ahora la duración, la cantidad y los extras solo existían en `orders`,
-- que se crea al cobrar. Un aviso guardado como borrador perdía por completo lo
-- que el usuario había configurado, y al retomarlo había que elegirlo de nuevo.
--
-- Estas columnas son NULL en cualquier aviso ya publicado (su plan real está en
-- la orden correspondiente); solo tienen sentido mientras `status = 'draft'`.
alter table public.listings
  add column if not exists plan_duration_days int,
  add column if not exists plan_quantity      int,
  add column if not exists plan_extras        jsonb;

-- Valores imposibles de alcanzar desde la UI (DURATIONS = 3,7,15,30,60,90 y
-- cantidad >= 1), pero la BD no debe fiarse del cliente.
alter table public.listings
  drop constraint if exists listings_plan_duration_days_check;
alter table public.listings
  add constraint listings_plan_duration_days_check
  check (plan_duration_days is null or plan_duration_days between 1 and 365);

alter table public.listings
  drop constraint if exists listings_plan_quantity_check;
alter table public.listings
  add constraint listings_plan_quantity_check
  check (plan_quantity is null or plan_quantity between 1 and 100);

comment on column public.listings.plan_duration_days is
  'Días de vigencia elegidos antes de pagar. Solo relevante en status=draft.';
comment on column public.listings.plan_quantity is
  'Cantidad de avisos del paquete elegida antes de pagar. Solo relevante en status=draft.';
comment on column public.listings.plan_extras is
  'Extras elegidos antes de pagar ({img500, urgente, ...}). Solo relevante en status=draft.';
