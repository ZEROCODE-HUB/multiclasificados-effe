-- =====================================================================
-- 0004_commerce.sql — Precios, órdenes y comprobantes (boletas/facturas)
-- =====================================================================

-- ---------- pricing_settings (refleja PricingSettings de src/lib/pricing.ts) ----------
create table public.pricing_settings (
  id             uuid primary key default gen_random_uuid(),
  base           numeric(10,2) not null,                 -- precio base 1 aviso x 7 días (incl. IGV)
  desc_por_aviso numeric(5,4)  not null,                 -- descuento decimal por aviso adicional
  saltos         jsonb not null,                         -- {"15":0.14,"30":0.13,"60":0.12,"90":0.11}
  extras         jsonb not null,                         -- {img100,img500,pdf100,pdf500,urgente,destacado,confidencial}
  is_active      boolean not null default true,
  updated_by     uuid references public.profiles (id),
  updated_at     timestamptz not null default now()
);
-- Solo una fila activa a la vez
create unique index pricing_settings_active_idx on public.pricing_settings (is_active) where is_active;

-- ---------- orders (compra de paquete de publicación) ----------
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  listing_qty      int  not null default 1,
  duration_days    int  not null,            -- 3 | 7 | 15 | 30 | 60 | 90
  extras           jsonb not null default '{}'::jsonb,
  subtotal         numeric(12,2) not null default 0,
  igv              numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,    -- recalculado en servidor (Edge Function)
  status           public.order_status not null default 'pending',
  payment_provider text,
  payment_ref      text,
  created_at       timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at);

-- ---------- order_listings (un paquete cubre N avisos) ----------
create table public.order_listings (
  order_id   uuid not null references public.orders (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  primary key (order_id, listing_id)
);

-- ---------- invoices (boletas/facturas; refleja Invoice de pricing.ts) ----------
create sequence if not exists public.invoice_number_seq;

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  number          text not null unique,    -- B001-000001 (generado server-side)
  type            public.invoice_type not null default 'boleta',
  email           text,
  advertiser_name text,
  doc_number      text,
  amount          numeric(12,2) not null,
  detail          text,
  issued_at       timestamptz not null default now()
);
create index invoices_order_idx on public.invoices (order_id);

-- Genera el número de comprobante (B001-000001) automáticamente al insertar.
create or replace function public.set_invoice_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null or new.number = '' then
    new.number := 'B001-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger invoices_set_number
  before insert on public.invoices
  for each row execute function public.set_invoice_number();
