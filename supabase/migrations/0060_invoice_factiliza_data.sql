-- =====================================================================
-- 0060_invoice_factiliza_data.sql
-- Guarda la ficha COMPLETA de Factiliza (nombre, documento, domicilio, ubigeo,
-- estado/condición del RUC, etc.) en el comprobante y el perfil, y rellena el
-- tipo/número de documento de las boletas viejas desde el perfil del dueño para
-- que el DNI/RUC se muestre. (idempotente)
-- =====================================================================

alter table public.invoices
  add column if not exists factiliza_data jsonb;

alter table public.profiles
  add column if not exists factiliza_data jsonb;

-- Backfill 1: las boletas sin número toman el DNI/RUC del perfil del dueño.
update public.invoices i
   set doc_number = coalesce(i.doc_number, p.doc_number)
  from public.orders o
  join public.profiles p on p.id = o.user_id
 where i.order_id = o.id
   and p.doc_number is not null
   and i.doc_number is null;

-- Backfill 2: el tipo se deriva de la LONGITUD del número (11 = RUC, si no DNI),
-- que es la fuente fiable — el perfil puede tener otro documento del mismo usuario.
update public.invoices
   set doc_type = case
       when length(regexp_replace(coalesce(doc_number, ''), '\D', '', 'g')) = 11
       then 'ruc'::public.doc_type else 'dni'::public.doc_type end
 where doc_number is not null and doc_number <> '';
