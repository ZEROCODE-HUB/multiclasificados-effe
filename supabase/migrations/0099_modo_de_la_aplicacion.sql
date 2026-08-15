-- =====================================================================
-- 0099_modo_de_la_aplicacion.sql
--
-- La aplicación entera está en PRUEBAS o está en PRODUCCIÓN. Un solo
-- interruptor, y de él cuelga todo lo demás.
--
-- Por qué cambia respecto a la 0098
-- ---------------------------------
-- La 0098 decidía si un comprobante era de prueba mirando quién lo había
-- liquidado (el simulador). Eso tenía sentido mientras convivían compras
-- reales y simuladas.
--
-- Pero hoy NO conviven: Izipay está en modo TEST (su clave pública es
-- `testpublickey_…`), o sea que TODOS los pagos que entran son de prueba
-- aunque vengan de la pasarela de verdad. Marcar unos sí y otros no era
-- describir mal la realidad — y dejaba que un pago de Izipay-test acabara
-- gastando un correlativo de la serie fiscal buena.
--
-- Con esto, mientras `app_produccion` esté en false:
--   · todo comprobante nace marcado como prueba;
--   · usa las series de pruebas (B066/F066), nunca las reales;
--   · el PDF y el correo avisan de que no tiene valor fiscal.
--
-- Y el día del salto a producción se cambia UN valor. La receta completa
-- está en la skill `pasar-a-produccion`.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. El interruptor ----------
insert into public.system_settings (key, value)
values ('app_produccion', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.app_produccion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case
              when jsonb_typeof(value) = 'boolean' then value::text::boolean
              when jsonb_typeof(value) = 'string'  then lower(value #>> '{}') in ('true','1')
              else false
            end
       from public.system_settings where key = 'app_produccion'),
    false);
$$;

revoke execute on function public.app_produccion() from public;
grant  execute on function public.app_produccion() to service_role, authenticated, anon;

comment on function public.app_produccion() is
  'false = la app está en PRUEBAS: los comprobantes van a las series B066/F066, '
  'se marcan sin valor fiscal y se emiten contra el entorno de pruebas de '
  'Factiliza. true = producción. Lo cambia la skill pasar-a-produccion.';

-- `invoice_emission_live` queda obsoleto: lo sustituye `app_produccion`, que
-- describe el estado de la aplicación entera y no solo el de la facturación.
delete from public.system_settings where key = 'invoice_emission_live';
drop function if exists public.invoice_emission_live();

-- ---------- 2. Liquidación: el modo lo decide la app, no quién pagó ----------
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
  v_publicado boolean := null;
  v_error    text     := null;
begin
  update public.orders
     set status           = 'paid',
         payment_provider = coalesce(payment_provider, 'izipay'),
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
  v_prueba := not public.app_produccion();
  v_emitir := public.invoice_emission_enabled();

  insert into public.invoices (
    order_id, type, email, advertiser_name, doc_type, doc_number,
    factiliza_data, amount, subtotal, igv, detail, es_prueba,
    sunat_status, sunat_next_try_at, sunat_last_error, email_next_try_at
  ) values (
    v_order.id,
    coalesce(nullif(v_receipt ->> 'receiptType', ''), 'boleta')::public.invoice_type,
    v_receipt ->> 'email',
    v_receipt ->> 'advertiserName',
    nullif(v_receipt ->> 'docType', '')::public.doc_type,
    nullif(v_receipt ->> 'docNumber', ''),
    v_receipt -> 'factilizaData',
    v_order.total,
    v_order.subtotal,
    v_order.igv,
    v_detail,
    v_prueba,
    case when v_emitir then 'pendiente' else 'omitido' end::public.invoice_sunat_status,
    case when v_emitir then now() else null end,
    case when v_emitir then null
         else 'Emisión electrónica apagada: comprobante interno' end,
    now()
  )
  returning number into v_number;

  perform public.add_credits(v_order.user_id, v_credits, v_detail, v_order.id);

  v_listing := nullif(v_extras ->> 'listing_id', '')::uuid;

  if v_extras ->> 'purpose' = 'publish' and v_listing is not null then
    v_dias := nullif(v_extras ->> 'duration_days', '')::int;
    begin
      perform public.effe_publish_listing(v_listing, v_dias, v_order.user_id);
      v_publicado := true;
    exception when others then
      -- Que el aviso no salga NO puede tumbar el cobro: el dinero entró, el
      -- comprobante se emitió y el saldo está acreditado.
      v_publicado := false;
      v_error     := sqlerrm;
    end;

    update public.orders
       set extras = coalesce(extras, '{}'::jsonb)
                    || jsonb_build_object('published', v_publicado)
                    || case when v_error is null then '{}'::jsonb
                            else jsonb_build_object('publish_error', v_error) end
     where id = v_order.id;
  end if;

  return jsonb_build_object(
    'settled', true,
    'invoice_number', v_number,
    'credits', v_credits,
    'es_prueba', v_prueba,
    'published', v_publicado
  );
end;
$$;

revoke execute on function public.settle_paid_order(uuid, text) from public, anon, authenticated;
grant  execute on function public.settle_paid_order(uuid, text) to service_role;
