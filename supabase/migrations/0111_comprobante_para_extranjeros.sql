-- =====================================================================
-- 0111_comprobante_para_extranjeros.sql — el comprobante guarda el país del
-- cliente.
--
-- Al abrir la compra a extranjeros (pasaporte o carné de extranjería, sin pasar
-- por Factiliza) hace falta saber de dónde es quien compra: va en la boleta, y
-- es lo que permite separar después las ventas a no residentes.
--
-- `settle_paid_order` se recrea ENTERA, no se parchea: es la función que mueve
-- el dinero y tiene que poder leerse de una sola pieza. El cuerpo es el de la
-- 0096 más la columna nueva. Sus permisos se vuelven a aplicar al final, porque
-- `create or replace` no los conserva si la función se recrea con otra firma
-- (aquí no cambia, pero repetirlos es gratis y evita un descuido).
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

alter table public.invoices add column if not exists pais text;

comment on column public.invoices.pais is
  'País del cliente (ISO-3166-1 alpha-2). Por defecto PE. Se usa para los '
  'comprobantes de extranjeros, que no pasan por la verificación de Factiliza.';

create or replace function public.settle_paid_order(
  p_order_id    uuid,
  p_payment_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    public.orders%rowtype;
  v_extras   jsonb;
  v_receipt  jsonb;
  v_credits  numeric;
  v_detail   text;
  v_number   text;
  v_updated  int;
  v_emitir   boolean;
  v_listing  uuid;
  v_dias     int;
  v_publicado boolean := null;
  v_error    text     := null;
begin
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
    return jsonb_build_object('settled', false);
  end if;

  v_extras  := coalesce(v_order.extras, '{}'::jsonb);
  v_receipt := coalesce(v_extras -> 'receipt', '{}'::jsonb);
  v_credits := coalesce((v_extras ->> 'credits')::numeric, 0);
  v_detail  := coalesce(v_extras ->> 'detail', 'Compra de saldo');
  v_emitir  := public.invoice_emission_enabled();

  insert into public.invoices (
    order_id, type, email, advertiser_name, doc_type, doc_number, pais,
    factiliza_data, amount, subtotal, igv, detail,
    sunat_status, sunat_next_try_at, sunat_last_error, email_next_try_at
  ) values (
    v_order.id,
    coalesce(nullif(v_receipt ->> 'receiptType', ''), 'boleta')::public.invoice_type,
    v_receipt ->> 'email',
    v_receipt ->> 'advertiserName',
    nullif(v_receipt ->> 'docType', '')::public.doc_type,
    nullif(v_receipt ->> 'docNumber', ''),
    upper(coalesce(nullif(v_receipt ->> 'country', ''), 'PE')),
    v_receipt -> 'factilizaData',
    v_order.total,
    v_order.subtotal,
    v_order.igv,
    v_detail,
    case when v_emitir then 'pendiente' else 'omitido' end::public.invoice_sunat_status,
    case when v_emitir then now() else null end,
    case when v_emitir then null
         else 'Emisión electrónica no configurada: comprobante interno' end,
    now()
  )
  returning number into v_number;

  -- El saldo entra ANTES de publicar: publicar cobra el costo completo del
  -- aviso, y lo que se pagó aquí es solo la parte que faltaba.
  perform public.add_credits(v_order.user_id, v_credits, v_detail, v_order.id);

  -- ---- Orden atada a un aviso: se publica aquí mismo ----
  v_listing := nullif(v_extras ->> 'listing_id', '')::uuid;

  if v_extras ->> 'purpose' = 'publish' and v_listing is not null then
    v_dias := nullif(v_extras ->> 'duration_days', '')::int;
    begin
      perform public.effe_publish_listing(v_listing, v_dias, v_order.user_id);
      v_publicado := true;
    exception when others then
      -- Que el aviso no salga NO puede tumbar el cobro: el dinero entró, el
      -- comprobante se emitió y el saldo está acreditado. El aviso se queda en
      -- borradores —ya con saldo de sobra para publicarlo de un clic— y el
      -- motivo queda anotado en la orden para poder diagnosticarlo.
      v_publicado := false;
      v_error     := sqlerrm;
    end;

    update public.orders
       set extras = extras || jsonb_build_object(
             'published',     v_publicado,
             'publish_error', v_error)
     where id = v_order.id;
  end if;

  return jsonb_build_object(
    'settled',        true,
    'invoice_number', v_number,
    'credits',        v_credits,
    'user_id',        v_order.user_id,
    'listing_id',     v_listing,
    'published',      v_publicado
  );
end;
$$;

-- ---------- Permisos (los mismos de la 0096) ----------
-- Mueve dinero: solo el servidor.
revoke execute on function public.settle_paid_order(uuid, text) from public;
revoke execute on function public.settle_paid_order(uuid, text) from anon;
revoke execute on function public.settle_paid_order(uuid, text) from authenticated;
grant  execute on function public.settle_paid_order(uuid, text) to service_role;
