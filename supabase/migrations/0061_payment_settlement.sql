-- =====================================================================
-- 0061_payment_settlement.sql — Liquidación de pagos de la pasarela (Izipay)
--
-- La compra de créditos deja de "auto-pagarse" en el cliente. Ahora:
--   1) create-payment (Edge Function) crea la orden en 'pending' con el payload
--      de liquidación en orders.extras y pide el formToken a Izipay.
--   2) payment-webhook (IPN) valida la firma y llama a settle_paid_order() con
--      SERVICE ROLE cuando el pago se confirma.
--
-- settle_paid_order() es la ÚNICA vía que acredita créditos y emite la boleta,
-- y es IDEMPOTENTE: Izipay puede reintentar la notificación, así que el gate
-- 'status <> paid' garantiza que se acredite una sola vez por orden.
-- (idempotente / re-ejecutable)
-- =====================================================================

-- Marca de tiempo del pago confirmado (útil para conciliación y reportes).
alter table public.orders
  add column if not exists paid_at timestamptz;

-- Defensa en profundidad: como mucho una transacción de compra por orden.
-- Aunque el gate de estado ya evita la doble acreditación, este índice bloquea
-- a nivel de datos cualquier segundo 'purchase' sobre la misma orden.
create unique index if not exists credit_tx_order_purchase_uidx
  on public.credit_transactions (order_id)
  where type = 'purchase' and order_id is not null;

-- ---------- settle_paid_order (atómica e idempotente) ----------
create or replace function public.settle_paid_order(
  p_order_id   uuid,
  p_payment_ref text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order   public.orders%rowtype;
  v_extras  jsonb;
  v_receipt jsonb;
  v_credits numeric;
  v_detail  text;
  v_number  text;
  v_updated int;
begin
  -- Gate atómico: pasa a 'paid' SOLO si aún no lo estaba. Si otra entrega del
  -- mismo IPN ya la liquidó, no afecta filas y salimos sin acreditar de nuevo.
  update public.orders
     set status           = 'paid',
         payment_provider = 'izipay',
         payment_ref      = coalesce(p_payment_ref, payment_ref),
         paid_at          = now()
   where id = p_order_id
     and status <> 'paid'
   returning * into v_order;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    -- Ya estaba pagada (idempotencia) o la orden no existe.
    return jsonb_build_object('settled', false);
  end if;

  v_extras  := coalesce(v_order.extras, '{}'::jsonb);
  v_receipt := coalesce(v_extras -> 'receipt', '{}'::jsonb);
  v_credits := coalesce((v_extras ->> 'credits')::numeric, 0);
  v_detail  := coalesce(v_extras ->> 'detail', 'Compra de saldo');

  -- Comprobante interno (el número B001-000001 lo pone el trigger existente).
  insert into public.invoices (
    order_id, type, email, advertiser_name, doc_type, doc_number,
    factiliza_data, amount, detail
  ) values (
    v_order.id,
    coalesce(nullif(v_receipt ->> 'receiptType', ''), 'boleta')::public.invoice_type,
    v_receipt ->> 'email',
    v_receipt ->> 'advertiserName',
    nullif(v_receipt ->> 'docType', '')::public.doc_type,
    nullif(v_receipt ->> 'docNumber', ''),
    v_receipt -> 'factilizaData',
    v_order.total,
    v_detail
  )
  returning number into v_number;

  -- Acreditar el saldo comprado (crea la fila de user_credits si no existe).
  perform public.add_credits(v_order.user_id, v_credits, v_detail, v_order.id);

  return jsonb_build_object(
    'settled',        true,
    'invoice_number', v_number,
    'credits',        v_credits,
    'user_id',        v_order.user_id
  );
end;
$$;

-- El webhook corre server-to-server (sin usuario): usa el service_role.
grant execute on function public.settle_paid_order(uuid, text) to service_role;

-- add_credits hoy solo tiene grant a 'authenticated'; settle_paid_order la llama
-- como SECURITY DEFINER, pero damos el grant a service_role por si se invoca
-- directamente desde una función server-side.
grant execute on function public.add_credits(uuid, numeric, text, uuid) to service_role;
