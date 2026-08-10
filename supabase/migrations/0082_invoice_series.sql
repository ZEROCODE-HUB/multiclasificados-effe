-- =====================================================================
-- 0082_invoice_series.sql — series y correlativos por tipo de comprobante,
-- estado de emisión y bitácora. Base para emitir ante SUNAT.
--
-- Tres problemas que arregla:
--
-- 1) La numeración salía SIEMPRE con serie 'B001-', incluso cuando el
--    comprobante era una FACTURA (0004_commerce.sql). Ante SUNAT una factura
--    lleva serie 'F001' y su propio correlativo; con la serie equivocada el
--    primer envío se rechaza. Ahora hay una fila de serie por tipo.
--
-- 2) El correlativo salía de una SECUENCIA. Una secuencia NO revierte con la
--    transacción: si el insert falla, ese número se pierde para siempre y la
--    numeración queda con huecos. En numeración fiscal los huecos hay que
--    justificarlos ante SUNAT. Se sustituye por `update ... returning`, que
--    toma bloqueo de fila (serializa a los concurrentes) y revierte con la
--    transacción.
--
-- 3) La policy `invoices_insert_owner_or_staff` (0019) permitía al dueño de una
--    orden INSERTAR comprobantes desde el navegador. Hoy es inocuo porque nadie
--    la usa —el único insert lo hace `settle_paid_order`, que es SECURITY
--    DEFINER—, pero en cuanto los comprobantes se declaren a SUNAT sería
--    fabricar documentos fiscales. Se elimina.
--
-- Los comprobantes que ya existen se marcan como internos: nunca se enviaron a
-- SUNAT y no deben intentarlo (ver 0083 para la máquina de estados).
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- Estado de la emisión ante SUNAT ----------
do $$ begin
  create type public.invoice_sunat_status as enum (
    'pendiente',   -- creado, aún sin intentar
    'enviando',    -- reclamado por un worker (con arrendamiento, ver 0083)
    'aceptado',    -- SUNAT lo aceptó
    'observado',   -- aceptado pero con notas: válido, se revisa
    'rechazado',   -- datos mal; no se reintenta solo
    'error',       -- fallo de red o del proveedor; sí se reintenta
    'omitido',     -- emisión apagada o configuración incompleta
    'vencido'      -- fuera de plazo o sin más reintentos; lo resuelve contabilidad
  );
exception when duplicate_object then null;
end $$;

-- ---------- Series y correlativos, uno por tipo ----------
create table if not exists public.invoice_series (
  id          public.invoice_type primary key,  -- 'boleta' | 'factura'
  tipo_doc    text        not null,             -- código SUNAT: '03' | '01'
  serie       text        not null unique,      -- 'B001' | 'F001'
  correlativo bigint      not null default 0,
  enabled     boolean     not null default true,
  updated_at  timestamptz not null default now()
);

insert into public.invoice_series (id, tipo_doc, serie) values
  ('boleta',  '03', 'B001'),
  ('factura', '01', 'F001')
on conflict (id) do nothing;

comment on table public.invoice_series is
  'Serie y correlativo por tipo de comprobante. La serie debe coincidir con la '
  'autorizada en SUNAT: si allí figura otra, actualizar aquí ANTES de emitir.';

-- ---------- Columnas de emisión y evidencia fiscal ----------
alter table public.invoices
  add column if not exists serie               text,
  add column if not exists correlativo         bigint,
  -- El importe ya se guarda en `amount` con IGV incluido; se desglosa aquí
  -- porque SUNAT exige base imponible e IGV por separado.
  add column if not exists subtotal            numeric(12,2),
  add column if not exists igv                 numeric(12,2),
  add column if not exists currency            text not null default 'PEN',
  add column if not exists emisor_ruc          text,
  add column if not exists sunat_status        public.invoice_sunat_status not null default 'pendiente',
  add column if not exists sunat_attempts      int  not null default 0,
  add column if not exists sunat_claim_id      uuid,
  add column if not exists sunat_claimed_at    timestamptz,
  add column if not exists sunat_next_try_at   timestamptz,
  -- Se congela en el primer intento y NO se recalcula: SUNAT rechaza los
  -- comprobantes enviados fuera de plazo, y re-fecharlos sería declarar mal la
  -- operación.
  add column if not exists sunat_fecha_emision timestamptz,
  add column if not exists sunat_sent_at       timestamptz,
  add column if not exists sunat_hash          text,
  add column if not exists sunat_cdr           jsonb,
  add column if not exists sunat_cdr_zip       text,
  add column if not exists sunat_error_code    text,
  add column if not exists sunat_last_error    text,
  add column if not exists needs_review        boolean not null default false,
  add column if not exists pdf_path            text,
  add column if not exists xml_path            text,
  add column if not exists email_status        text not null default 'pendiente',
  add column if not exists email_attempts      int  not null default 0,
  add column if not exists email_claim_id      uuid,
  add column if not exists email_claimed_at    timestamptz,
  add column if not exists email_next_try_at   timestamptz,
  add column if not exists email_sent_at       timestamptz,
  add column if not exists email_message_id    text,
  add column if not exists email_last_error    text;

do $$ begin
  alter table public.invoices
    add constraint invoices_email_status_chk
    check (email_status in ('pendiente','enviando','enviado','error','omitido'));
exception when duplicate_object then null;
end $$;

-- ---------- Bitácora de intentos: la evidencia cruda ----------
create table if not exists public.invoice_emission_attempts (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  step        text not null,          -- 'send' | 'pdf' | 'xml' | 'email' | 'precheck'
  attempt     int  not null,
  http_status int,
  ok          boolean not null default false,
  request     jsonb,                  -- lo enviado, SIN el token
  response    jsonb,                  -- lo recibido, tal cual
  created_at  timestamptz not null default now()
);
create index if not exists invoice_attempts_inv_idx
  on public.invoice_emission_attempts (invoice_id, created_at desc);

alter table public.invoice_emission_attempts enable row level security;
do $$ begin
  create policy "invoice_attempts_select_staff" on public.invoice_emission_attempts
    for select using (public.has_perm('Pagos y planes', 'view'));
exception when duplicate_object then null;
end $$;

-- ---------- Los comprobantes ya existentes son internos ----------
-- Se rellenan serie y correlativo leyéndolos del número que ya tienen, y se
-- marcan como 'omitido': ninguno pasó por SUNAT y ninguno debe intentarlo ahora.
update public.invoices
   set serie            = split_part(number, '-', 1),
       correlativo      = nullif(regexp_replace(number, '^.*-', ''), '')::bigint,
       sunat_status     = 'omitido',
       email_status     = 'omitido',
       sunat_last_error = 'Comprobante anterior a la emisión electrónica'
 where serie is null;

-- El correlativo de cada serie arranca donde terminaron los históricos, para
-- que el primer comprobante nuevo no choque con uno viejo.
update public.invoice_series s
   set correlativo = greatest(s.correlativo, coalesce((
         select max(i.correlativo) from public.invoices i where i.serie = s.serie
       ), 0));

-- ---------- Invariantes de datos ----------
-- Estos índices son la garantía dura de que no hay dos comprobantes con el
-- mismo número ni dos comprobantes para la misma compra. El código puede tener
-- fallos; esto no.
create unique index if not exists invoices_serie_correlativo_uidx
  on public.invoices (serie, correlativo)
  where serie is not null and correlativo is not null;

create unique index if not exists invoices_order_uidx
  on public.invoices (order_id);

create index if not exists invoices_sunat_pending_idx
  on public.invoices (sunat_next_try_at)
  where sunat_status in ('pendiente', 'error', 'enviando');

create index if not exists invoices_email_pending_idx
  on public.invoices (email_next_try_at)
  where email_status in ('pendiente', 'error');

-- ---------- Numeración por serie ----------
-- `update ... returning` y NO `nextval`: ver la cabecera del archivo.
create or replace function public.next_invoice_number(p_type public.invoice_type)
returns table (o_serie text, o_correlativo bigint, o_number text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.invoice_series
     set correlativo = invoice_series.correlativo + 1,
         updated_at  = now()
   where id = p_type
  returning invoice_series.serie,
            invoice_series.correlativo,
            invoice_series.serie || '-' ||
              lpad(invoice_series.correlativo::text, 6, '0');
end;
$$;

-- El trigger de siempre, ahora con la serie que toca según el tipo.
create or replace function public.set_invoice_number()
returns trigger
language plpgsql
as $$
declare
  v record;
begin
  if new.number is null or new.number = '' then
    select * into v from public.next_invoice_number(coalesce(new.type, 'boleta'));
    new.number      := v.o_number;
    new.serie       := v.o_serie;
    new.correlativo := v.o_correlativo;
  end if;
  return new;
end;
$$;

-- ---------- Interruptor maestro ----------
-- Mientras esté apagado (o falte configuración del emisor), los comprobantes
-- nacen 'omitido': se numeran y se envían por correo, pero no se declaran.
create or replace function public.invoice_emission_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select case jsonb_typeof(s.value)
              when 'boolean' then s.value::text::boolean
              when 'string'  then lower(s.value #>> '{}') in ('true', '1')
              else false
            end
       from public.system_settings s
      where s.key = 'invoice_emission_enabled'),
    false
  );
$$;

insert into public.system_settings (key, value, label) values
  ('invoice_emission_enabled', 'false'::jsonb,
   'Emitir comprobantes electrónicos ante SUNAT (requiere RUC emisor y certificado)')
on conflict (key) do nothing;

-- ---------- Cierre del agujero de la 0019 ----------
-- El único INSERT válido en invoices es `settle_paid_order` (SECURITY DEFINER),
-- que corre server-side tras validar la firma del pago.
drop policy if exists "invoices_insert_owner_or_staff" on public.invoices;
drop policy if exists "invoices_insert_staff" on public.invoices;

comment on column public.invoices.sunat_status is
  'Estado ante SUNAT. ''omitido'' = comprobante interno: numerado y enviado por '
  'correo, pero no declarado (emisión apagada o sin configurar).';
