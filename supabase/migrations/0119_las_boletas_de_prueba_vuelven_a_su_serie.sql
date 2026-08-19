-- =====================================================================
-- 0119_las_boletas_de_prueba_vuelven_a_su_serie.sql
--
-- QUÉ PASÓ
-- --------
-- La 0111 recreó `settle_paid_order` entera —lo correcto— pero partió de la
-- versión de la 0096 en vez de la de la 0099, y por el camino se perdieron dos
-- cosas que la 0099 había añadido:
--
--   1. `es_prueba := not app_produccion()`. Sin eso, la columna se queda en su
--      valor por defecto (false) y el disparador `set_invoice_number` reparte
--      número de la serie de PRODUCCIÓN (B001) aunque la aplicación esté en
--      modo pruebas. SUNAT lo rechaza —«Su usuario no se encuentra configurado
--      para el RUC …»— y de paso se queman correlativos de la serie real, que
--      es justo lo que la 0082 y la 0098 se montaron para evitar.
--
--   2. `payment_provider = coalesce(payment_provider, 'izipay')`, que la 0111
--      convirtió en 'izipay' a secas. Eso ya se corrigió en la 0117 para que
--      los pagos por Yape/Plin no se contaran como cobros de la pasarela.
--
-- Se detectó emitiendo una boleta real de prueba: salió B001-000096 y SUNAT la
-- rechazó, mientras las que emite el reintento (que sí mira `es_prueba`) salían
-- en B066 y se aceptaban.
--
-- Aquí se recrea `settle_paid_order` con las dos cosas en su sitio, sobre la
-- versión vigente (0117: país del comprobante, renovación y proveedor).
--
-- NOTA PARA EL SALTO A PRODUCCIÓN
-- --------------------------------
-- Los correlativos de B001 gastados por este fallo NO se pueden reutilizar
-- desde aquí, y ninguno llegó a ser aceptado por SUNAT. Antes de poner
-- `app_produccion = true` conviene revisar `invoice_series.correlativo` y
-- decidir desde qué número arranca la numeración real (ver la skill
-- `pasar-a-produccion`).
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

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
  v_prueba   boolean;
  v_listing  uuid;
  v_dias     int;
  v_purpose  text;
  v_publicado boolean := null;
  v_error    text     := null;
begin
  update public.orders
     set status           = 'paid',
         -- Un pago aprobado a mano NO lo cobró la pasarela, y los reportes de
         -- ingresos separan una cosa de la otra por este campo.
         payment_provider = case
                              when payment_provider in ('yape', 'plin') then payment_provider
                              else 'izipay'
                            end,
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

  -- Mientras la app esté en pruebas, TODO es de prueba. Da igual por dónde
  -- entrara el pago: si Izipay está en modo test, ese cobro tampoco es real.
  -- Esta línea es la que decide la serie del comprobante (B066 vs B001).
  v_prueba  := not public.app_produccion();
  v_emitir  := public.invoice_emission_enabled();

  insert into public.invoices (
    order_id, type, email, advertiser_name, doc_type, doc_number, pais,
    factiliza_data, amount, subtotal, igv, detail, es_prueba,
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
    v_prueba,
    case when v_emitir then 'pendiente' else 'omitido' end::public.invoice_sunat_status,
    case when v_emitir then now() else null end,
    case when v_emitir then null
         else 'Emisión electrónica no configurada: comprobante interno' end,
    now()
  )
  returning number into v_number;

  -- El saldo entra ANTES de publicar/renovar: esas operaciones cobran el costo
  -- completo, y lo que se pagó aquí es solo la parte que faltaba.
  perform public.add_credits(v_order.user_id, v_credits, v_detail, v_order.id);

  -- ---- Orden atada a un aviso ----
  v_listing := nullif(v_extras ->> 'listing_id', '')::uuid;
  v_purpose := v_extras ->> 'purpose';

  if v_purpose in ('publish', 'renew') and v_listing is not null then
    v_dias := nullif(v_extras ->> 'duration_days', '')::int;
    begin
      if v_purpose = 'renew' then
        perform public.effe_renovar_aviso(v_listing, v_dias, v_order.user_id);
      else
        perform public.effe_publish_listing(v_listing, v_dias, v_order.user_id);
      end if;
      v_publicado := true;
    exception when others then
      -- Que el aviso no salga NO puede tumbar el cobro: el dinero entró, el
      -- comprobante se emitió y el saldo está acreditado.
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
    'es_prueba',      v_prueba,
    'published',      v_publicado
  );
end;
$$;

revoke execute on function public.settle_paid_order(uuid, text) from public, anon, authenticated;
grant  execute on function public.settle_paid_order(uuid, text) to service_role;
