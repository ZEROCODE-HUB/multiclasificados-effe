-- =====================================================================
-- 0109_ordenes_que_no_se_quedan_colgadas.sql — si el aviso de pago no llega,
-- la orden se verifica contra Izipay en vez de quedarse pendiente para siempre.
--
-- EL PROBLEMA, tal como está hoy:
--   `create-payment` deja la orden en 'pending' y TODO lo demás (acreditar el
--   saldo, emitir la boleta, publicar el aviso) cuelga de que Izipay nos llame
--   al webhook. Si esa llamada no llega —se cortó el internet del comprador
--   mientras la pasarela nos avisaba, nuestra función estuvo caída un minuto,
--   la URL del IPN estaba mal— la orden se queda en 'pending' PARA SIEMPRE,
--   aunque el dinero sí se haya cobrado. No hay cron, ni reintento, ni forma de
--   preguntarle a Izipay: el único rescate era `pollOrderStatus`, que necesita
--   la pantalla abierta con el id de la orden en memoria.
--
-- LA SOLUCIÓN: preguntar. La API de Izipay tiene `Order/Get`, con la misma
-- autenticación que ya usamos para crear el pago, así que no hacen falta
-- credenciales nuevas. Esta migración pone la parte de base de datos:
--   · columnas para saber qué se ha intentado y cuándo toca reintentar,
--   · `sweep_pending_orders`, que despierta la verificación de las pendientes,
--   · el cron cada 5 minutos que lo llama.
-- La verificación en sí la hace la Edge Function `verify-payment`.
--
-- POR QUÉ NO PUEDE ACREDITAR DOS VECES: la verificación no toca el saldo; llama
-- a `settle_paid_order`, que ya es idempotente (gate atómico
-- `update orders set status='paid' where status <> 'paid'` + índice único sobre
-- credit_transactions(order_id) de la 0061). Si el IPN llegó primero, el barrido
-- no hace nada.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- Rastro de la verificación ----------
alter table public.orders add column if not exists verify_attempts    int not null default 0;
alter table public.orders add column if not exists verified_at        timestamptz;
alter table public.orders add column if not exists verify_next_try_at timestamptz;
alter table public.orders add column if not exists verify_last_error  text;

comment on column public.orders.verify_attempts is
  'Cuántas veces se le ha preguntado a Izipay por esta orden.';
comment on column public.orders.verify_next_try_at is
  'Cuándo toca volver a preguntar. Crece exponencialmente para no machacar la API.';

-- Las pendientes son pocas y se consultan cada 5 minutos: índice parcial.
create index if not exists orders_pendientes_idx
  on public.orders (created_at) where status = 'pending';

-- ---------- Secreto compartido con el worker ----------
-- Mismo enfoque que `invoice_worker_secret` (0083): la Edge Function la llama la
-- propia base de datos, sin JWT, así que se identifica con este secreto. Sin
-- configurar, el barrido no hace nada y las órdenes se quedan como están: nada
-- se pierde y nada miente.
create or replace function public.payment_worker_secret()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.value #>> '{}' from public.system_settings s
                    where s.key = 'payment_worker_secret'), '');
$$;

insert into public.system_settings (key, value, label) values
  ('payment_worker_secret', '""'::jsonb,
   'Secreto compartido con la función verify-payment (debe coincidir con su secret)')
on conflict (key) do nothing;

-- ---------- Aviso al worker, a prueba de fallos ----------
create or replace function public.dispatch_payment_verification(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public, net, extensions
as $$
begin
  begin
    perform net.http_post(
      url     := 'https://prhbgniwymaaevnisyov.supabase.co/functions/v1/verify-payment',
      body    := jsonb_build_object('orderId', p_order, 'worker', true),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-worker-secret', public.payment_worker_secret())
    );
  exception when others then
    -- pg_net ausente o caído no puede tumbar el barrido entero: la orden se
    -- reintenta en la pasada siguiente.
    null;
  end;
end;
$$;

-- ---------- Barrido de órdenes pendientes ----------
create or replace function public.sweep_pending_orders(p_limit int default 20)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_intentos int;
  v_n int := 0;
begin
  -- Las que llevan una semana pendientes no van a confirmarse: se cierran para
  -- que no se barran eternamente. Es seguro: el gate de `settle_paid_order` es
  -- `status <> 'paid'`, así que un aviso tardío TODAVÍA liquidaría la orden.
  -- (Si alguien cambia ese gate a `= 'pending'`, esto reabriría el agujero.)
  update public.orders
     set status = 'failed',
         verify_last_error = 'Sin confirmación de la pasarela tras 7 días'
   where status = 'pending'
     and created_at < now() - interval '7 days';

  for v_id, v_intentos in
    select o.id, o.verify_attempts
      from public.orders o
     where o.status = 'pending'
       -- Dos minutos de gracia: el aviso de pago normal llega en segundos, y no
       -- tiene sentido correr contra él.
       and o.created_at < now() - interval '2 minutes'
       and o.created_at > now() - interval '7 days'
       and coalesce(o.verify_next_try_at, now()) <= now()
     order by o.created_at
     limit greatest(0, p_limit)
  loop
    update public.orders
       set verify_attempts     = verify_attempts + 1,
           verify_next_try_at  = now() + make_interval(mins => least(60, power(2, v_intentos)::int))
     where id = v_id;

    perform public.dispatch_payment_verification(v_id);
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function public.sweep_pending_orders is
  'Despierta la verificación contra Izipay de las órdenes que llevan más de 2 '
  'minutos pendientes. No acredita nada por su cuenta: la Edge Function '
  'verify-payment llama a settle_paid_order, que es idempotente.';

-- ---------- Permisos ----------
-- Nadie desde el navegador: esto lo mueven el cron y la Edge Function.
revoke execute on function public.sweep_pending_orders(int) from public;
revoke execute on function public.sweep_pending_orders(int) from anon;
revoke execute on function public.sweep_pending_orders(int) from authenticated;
grant  execute on function public.sweep_pending_orders(int) to service_role;

revoke execute on function public.dispatch_payment_verification(uuid) from public;
revoke execute on function public.dispatch_payment_verification(uuid) from anon;
revoke execute on function public.dispatch_payment_verification(uuid) from authenticated;
grant  execute on function public.dispatch_payment_verification(uuid) to service_role;

revoke execute on function public.payment_worker_secret() from public;
revoke execute on function public.payment_worker_secret() from anon;
revoke execute on function public.payment_worker_secret() from authenticated;
grant  execute on function public.payment_worker_secret() to service_role;

-- ---------- Cron ----------
-- Tolerante a que pg_cron no esté disponible (mismo patrón que la 0098): la
-- migración no puede fallar por esto.
do $$
begin
  perform cron.unschedule('sweep-pending-orders');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('sweep-pending-orders', '*/5 * * * *',
                        $cron$ select public.sweep_pending_orders(20); $cron$);
exception when others then
  raise notice 'pg_cron no disponible: programa "sweep-pending-orders" a mano';
end $$;
