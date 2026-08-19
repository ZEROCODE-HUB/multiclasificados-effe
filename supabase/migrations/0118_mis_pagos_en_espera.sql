-- =====================================================================
-- 0118_mis_pagos_en_espera.sql — que el comprador vea su pago esperando.
--
-- Un aviso pagado por Yape se queda en 'draft' hasta que alguien confirma el
-- pago. Sin esta consulta, en "Mis avisos" aparecería como un borrador más,
-- indistinguible de uno a medio escribir, y el usuario volvería a pulsar
-- «Publicar» —y a pagar— porque nada le dice que ya pagó.
--
-- Devuelve solo lo propio (filtra por auth.uid()), así que no hace falta ningún
-- permiso: es la información de su propia compra.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

create or replace function public.mis_pagos_manuales_pendientes()
returns table (
  order_id     uuid,
  listing_id   uuid,
  metodo       text,
  total        numeric,
  proposito    text,
  confirmado   boolean,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id,
         nullif(o.extras ->> 'listing_id', '')::uuid,
         o.payment_provider,
         o.total,
         o.extras ->> 'purpose',
         o.manual_confirmed_at is not null,
         o.created_at
    from public.orders o
   where o.user_id = auth.uid()
     and o.status = 'pending'
     and o.payment_provider in ('yape', 'plin')
   order by o.created_at desc
   limit 50;
$$;

comment on function public.mis_pagos_manuales_pendientes is
  'Pagos por Yape/Plin del usuario que siguen esperando confirmación. Se usa '
  'para marcar sus avisos y su saldo como "en camino".';

grant execute on function public.mis_pagos_manuales_pendientes() to authenticated;
