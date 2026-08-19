-- =====================================================================
-- 0117_pagos_con_yape_y_plin.sql — cobrar por Yape y Plin, con aprobación
-- manual.
--
-- CÓMO ENCAJA CON LO QUE YA HAY
-- -----------------------------
-- No se inventa una vía nueva de acreditar dinero. Un pago por Yape es una
-- `orders` normal en 'pending' con `payment_provider = 'yape'`, y cuando el
-- administrador la aprueba se liquida con la MISMA `settle_paid_order` que usa
-- la pasarela. Eso significa que un pago por Yape:
--   · acredita el saldo,
--   · emite su boleta,
--   · y publica o renueva el aviso si la orden venía de "pagar y publicar",
-- exactamente igual y por el mismo camino ya probado. Lo único que cambia es
-- quién da el visto bueno: Izipay en segundos, o una persona en unos minutos.
--
-- Tres cosas que hay que tener en cuenta y que esta migración resuelve:
--
--   1. `settle_paid_order` escribía `payment_provider = 'izipay'` a fuego. Con
--      eso, todo pago aprobado a mano habría quedado registrado como cobrado
--      por la pasarela, y los reportes de ingresos (0094/0097, que filtran por
--      ese campo) habrían mezclado ambas cosas. Ahora respeta el proveedor que
--      ya trae la orden.
--
--   2. El barrido de órdenes colgadas (0109) le preguntaría a Izipay por unas
--      órdenes que Izipay no conoce, y desde la corrección de hoy las cerraría
--      a la hora: un pago de Yape esperando aprobación habría muerto solo antes
--      de que nadie lo mirara. El barrido pasa a ser solo de Izipay.
--
--   3. El importe se puede corregir al aprobar (si el voucher no cuadra con lo
--      que el sistema calculó), y entonces hay que recalcular el saldo a
--      acreditar y el desglose del IGV, o la boleta saldría descuadrada.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- 1. La orden recuerda su revisión ----------
alter table public.orders add column if not exists manual_confirmed_at timestamptz;
alter table public.orders add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists reviewed_at timestamptz;
alter table public.orders add column if not exists review_note text;

comment on column public.orders.manual_confirmed_at is
  'Cuándo el comprador declaró haber pagado por Yape/Plin. Nulo mientras no lo '
  'confirme: distingue "abrió la pantalla y se fue" de "dice que ya pagó".';
comment on column public.orders.review_note is
  'Nota del administrador al aprobar o rechazar un pago manual.';

-- Bandeja del administrador: lo pendiente de revisar, lo primero confirmado.
create index if not exists orders_pago_manual_idx
  on public.orders (status, manual_confirmed_at desc nulls last)
  where payment_provider in ('yape', 'plin');

-- ---------- 2. Configuración (cuentas, WhatsApp y mensaje) ----------
-- Un solo ajuste con todo dentro: se lee de una vez y se guarda de una vez, y
-- añadir una cuenta más no obliga a tocar la base.
insert into public.system_settings (key, value, label) values (
  'yape_plin',
  jsonb_build_object(
    'activo',   false,
    'cuentas',  '[]'::jsonb,
    'whatsapp', '',
    'mensaje',  'Hola, acabo de pagar mi recarga de saldo en eFFe. Adjunto mi voucher.'
  ),
  'Yape/Plin: cuentas, WhatsApp de comprobantes y mensaje predeterminado'
) on conflict (key) do nothing;

-- Lo que el comprador necesita ver. Deliberadamente NO expone el ajuste entero
-- (`get_settings` es solo para el equipo): de aquí sale únicamente lo que va
-- impreso en la pantalla de pago.
create or replace function public.yape_plin_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select value from public.system_settings where key = 'yape_plin'
  )
  select jsonb_build_object(
    'activo',   coalesce((select (value -> 'activo')::text::boolean from c), false),
    'cuentas',  coalesce((select value -> 'cuentas' from c), '[]'::jsonb),
    'whatsapp', coalesce((select value ->> 'whatsapp' from c), ''),
    'mensaje',  coalesce((select value ->> 'mensaje' from c), '')
  );
$$;

comment on function public.yape_plin_config is
  'Datos públicos del pago por Yape/Plin: cuentas, WhatsApp y mensaje. Los lee '
  'el comprador en la pantalla de pago.';

-- ---------- 3. Liquidación: respetar quién cobró ----------
-- Copia literal de la 0113 con UN cambio: `payment_provider` deja de forzarse a
-- 'izipay'. Se recrea entera a propósito — es la función que mueve el dinero y
-- tiene que poder leerse de una pieza.
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
    'published',      v_publicado
  );
end;
$$;

-- ---------- 4. El barrido es solo de Izipay ----------
-- Calco de la 0109 con el filtro por proveedor. Sin él, el barrido preguntaría
-- por estas órdenes a una pasarela que no las conoce y las cerraría solas.
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
  --
  -- Los pagos por Yape/Plin quedan fuera: los cierra una persona desde su
  -- bandeja, y uno que lleve días esperando es justo el que hay que mirar, no
  -- el que hay que enterrar.
  update public.orders
     set status = 'failed',
         verify_last_error = 'Sin confirmación de la pasarela tras 7 días'
   where status = 'pending'
     and coalesce(payment_provider, 'izipay') not in ('yape', 'plin')
     and created_at < now() - interval '7 days';

  for v_id, v_intentos in
    select o.id, o.verify_attempts
      from public.orders o
     where o.status = 'pending'
       and coalesce(o.payment_provider, 'izipay') not in ('yape', 'plin')
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

-- ---------- 5. El comprador dice que ya pagó ----------
create or replace function public.confirmar_pago_manual(p_order uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order;

  if v_order.id is null or v_order.user_id <> auth.uid() then
    raise exception 'EF030: orden no encontrada';
  end if;
  if coalesce(v_order.payment_provider, '') not in ('yape', 'plin') then
    raise exception 'EF031: esta orden no se paga por Yape o Plin';
  end if;
  if v_order.status <> 'pending' then
    -- Ya resuelta: no es un error que merezca pantalla roja, el comprador
    -- simplemente pulsó dos veces o volvió atrás.
    return jsonb_build_object('ok', true, 'status', v_order.status);
  end if;

  update public.orders
     set manual_confirmed_at = coalesce(manual_confirmed_at, now())
   where id = p_order;

  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

-- ---------- 6. Bandeja del administrador ----------
create or replace function public.admin_pagos_manuales(
  p_estado text default 'pending',
  p_search text default null,
  p_limit  int  default 20,
  p_offset int  default 0
)
returns table (
  id                  uuid,
  user_id             uuid,
  full_name           text,
  email               text,
  metodo              text,
  total               numeric,
  detalle             text,
  proposito           text,
  listing_id          uuid,
  listing_title       text,
  status              text,
  manual_confirmed_at timestamptz,
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz,
  total_count         bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_perm('Pagos Yape/Plin', 'view') then
    raise exception 'EF001: sin permiso';
  end if;

  return query
  select o.id,
         o.user_id,
         coalesce(p.full_name, 'Usuario eliminado'),
         coalesce(p.email, ''),
         o.payment_provider,
         o.total,
         coalesce(o.extras ->> 'detail', 'Compra de saldo'),
         o.extras ->> 'purpose',
         nullif(o.extras ->> 'listing_id', '')::uuid,
         l.title,
         o.status::text,
         o.manual_confirmed_at,
         o.reviewed_at,
         o.review_note,
         o.created_at,
         count(*) over () as total_count
    from public.orders o
    left join public.profiles p on p.id = o.user_id
    left join lateral (
      select li.title from public.listings li
       where li.id = nullif(o.extras ->> 'listing_id', '')::uuid
    ) l on true
   where o.payment_provider in ('yape', 'plin')
     and (p_estado is null or p_estado = 'all' or o.status::text = p_estado)
     and (
       p_search is null or btrim(p_search) = '' or
       coalesce(p.full_name, '') ilike '%' || btrim(p_search) || '%' or
       coalesce(p.email, '')     ilike '%' || btrim(p_search) || '%' or
       coalesce(l.title, '')     ilike '%' || btrim(p_search) || '%'
     )
   -- Lo confirmado por el comprador primero: es lo que espera respuesta.
   order by (o.manual_confirmed_at is null), o.manual_confirmed_at desc, o.created_at desc
   limit greatest(0, p_limit) offset greatest(0, p_offset);
end;
$$;

-- Contador para el aviso del menú. Aparte de la lista porque se pide mucho más
-- a menudo y no necesita traerse ninguna fila.
create or replace function public.admin_pagos_manuales_pendientes()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if not public.has_perm('Pagos Yape/Plin', 'view') then
    return 0;
  end if;
  select count(*) into v_n
    from public.orders
   where payment_provider in ('yape', 'plin')
     and status = 'pending'
     and manual_confirmed_at is not null;
  return coalesce(v_n, 0);
end;
$$;

-- ---------- 7. Aprobar ----------
create or replace function public.admin_aprobar_pago_manual(
  p_order uuid,
  p_monto numeric default null,
  p_nota  text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order    public.orders%rowtype;
  v_total    numeric;
  v_subtotal numeric;
  v_igv      numeric;
  v_res      jsonb;
begin
  if not public.has_perm('Pagos Yape/Plin', 'approve') then
    raise exception 'EF001: sin permiso para aprobar pagos';
  end if;

  select * into v_order from public.orders where id = p_order for update;
  if v_order.id is null or coalesce(v_order.payment_provider, '') not in ('yape', 'plin') then
    raise exception 'EF030: pago no encontrado';
  end if;
  if v_order.status = 'paid' then
    raise exception 'EF032: este pago ya fue aprobado';
  end if;

  -- Importe corregido: el voucher manda sobre lo que calculó el sistema. Al
  -- cambiarlo hay que rehacer el desglose y el saldo a acreditar, o la boleta
  -- diría un total y el detalle otro.
  v_total := round(coalesce(p_monto, v_order.total)::numeric, 2);
  if v_total <= 0 then
    raise exception 'EF033: el importe tiene que ser mayor que cero';
  end if;

  if v_total <> v_order.total then
    v_subtotal := round(v_total / 1.18, 2);
    v_igv      := round(v_total - v_subtotal, 2);
    update public.orders
       set total    = v_total,
           subtotal = v_subtotal,
           igv      = v_igv,
           extras   = extras || jsonb_build_object(
                        'credits',       v_total,
                        'monto_original', v_order.total)
     where id = p_order;
  end if;

  update public.orders
     set reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_order;

  -- Misma puerta que la pasarela: acredita, emite la boleta y publica o renueva
  -- el aviso si la orden venía de "pagar y publicar".
  v_res := public.settle_paid_order(p_order, 'YAPE-PLIN');

  perform public.notify_user(
    v_order.user_id,
    'manual_payment_approved',
    'Tu pago fue confirmado',
    jsonb_build_object(
      'order_id',   p_order,
      'metodo',     v_order.payment_provider,
      'monto',      v_total,
      'listing_id', nullif(v_order.extras ->> 'listing_id', ''),
      'purpose',    v_order.extras ->> 'purpose',
      'published',  v_res -> 'published'
    )
  );

  perform public.log_audit(
    'approve_manual_payment', 'order', p_order::text,
    jsonb_build_object('metodo', v_order.payment_provider, 'monto', v_total, 'nota', p_nota)
  );

  return v_res;
end;
$$;

-- ---------- 8. Rechazar ----------
create or replace function public.admin_rechazar_pago_manual(
  p_order  uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.has_perm('Pagos Yape/Plin', 'approve') then
    raise exception 'EF001: sin permiso para revisar pagos';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    -- Sin motivo, el comprador recibe un "no" a secas y escribe para preguntar
    -- por qué: el motivo es lo que evita ese segundo mensaje.
    raise exception 'EF034: escribe el motivo del rechazo';
  end if;

  select * into v_order from public.orders where id = p_order for update;
  if v_order.id is null or coalesce(v_order.payment_provider, '') not in ('yape', 'plin') then
    raise exception 'EF030: pago no encontrado';
  end if;
  if v_order.status = 'paid' then
    raise exception 'EF032: este pago ya fue aprobado; anula el comprobante si hay que revertirlo';
  end if;

  update public.orders
     set status      = 'failed',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = btrim(p_motivo)
   where id = p_order;

  perform public.notify_user(
    v_order.user_id,
    'manual_payment_rejected',
    'No pudimos confirmar tu pago',
    jsonb_build_object('order_id', p_order, 'motivo', btrim(p_motivo))
  );

  perform public.log_audit(
    'reject_manual_payment', 'order', p_order::text,
    jsonb_build_object('motivo', btrim(p_motivo))
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- 9. Permisos ----------
-- Por la 0104 estas funciones nacen sin EXECUTE para nadie salvo postgres y
-- service_role. Sin estos grants dan 42501 en cuanto se usan — y el fallo se ve
-- como una pantalla vacía, no como un error (pasó hoy mismo con el buscador).
grant execute on function public.yape_plin_config()                              to anon, authenticated;
grant execute on function public.confirmar_pago_manual(uuid)                     to authenticated;
grant execute on function public.admin_pagos_manuales(text, text, int, int)      to authenticated;
grant execute on function public.admin_pagos_manuales_pendientes()               to authenticated;
grant execute on function public.admin_aprobar_pago_manual(uuid, numeric, text)  to authenticated;
grant execute on function public.admin_rechazar_pago_manual(uuid, text)          to authenticated;

-- Las que mueven dinero sin preguntar por el permiso siguen siendo solo del
-- servidor.
revoke execute on function public.settle_paid_order(uuid, text) from public, anon, authenticated;
grant  execute on function public.settle_paid_order(uuid, text) to service_role;
revoke execute on function public.sweep_pending_orders(int)     from public, anon, authenticated;
grant  execute on function public.sweep_pending_orders(int)     to service_role;

-- ---------- 10. El módulo de permisos ----------
-- El superadmin lo tiene todo sin sembrar nada (has_perm devuelve true). Al
-- resto de roles se les da lo que ya tienen para cobros: quien puede ver los
-- pagos, ve esta bandeja; aprobar dinero se concede a mano.
insert into public.role_permissions (role, module, can_view, can_edit, can_approve, can_delete)
select rp.role, 'Pagos Yape/Plin', rp.can_view, false, false, false
  from public.role_permissions rp
 where rp.module = 'Pagos y planes'
on conflict (role, module) do nothing;
