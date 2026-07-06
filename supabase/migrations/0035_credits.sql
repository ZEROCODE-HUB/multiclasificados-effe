-- =====================================================================
-- 0035_credits.sql — Sistema de créditos pre-pagados
-- Modelo: 1 crédito = 1 sol (S/). El saldo se descuenta al publicar.
-- =====================================================================

-- ---------- user_credits (una fila por usuario) ----------
create table public.user_credits (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  balance    numeric(12,2) not null default 0 check (balance >= 0),
  updated_at timestamptz   not null default now()
);

-- ---------- credit_transactions (auditoría de movimientos) ----------
create table public.credit_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  type        text        not null check (type in ('purchase', 'spend')),
  credits     numeric(12,2) not null,       -- positivo = compra, negativo = gasto
  description text,
  listing_id  uuid        references public.listings (id) on delete set null,
  order_id    uuid        references public.orders (id)   on delete set null,
  created_at  timestamptz not null default now()
);
create index credit_transactions_user_idx on public.credit_transactions (user_id, created_at desc);

-- ---------- credit_packages (configurables por admin) ----------
create table public.credit_packages (
  id             uuid primary key default gen_random_uuid(),
  name           text           not null,
  credits_amount numeric(12,2)  not null check (credits_amount > 0),
  price_soles    numeric(12,2)  not null check (price_soles > 0),
  is_active      boolean        not null default true,
  sort_order     int            not null default 0,
  created_at     timestamptz    not null default now()
);

-- ---------- RLS ----------
alter table public.user_credits       enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_packages     enable row level security;

-- user_credits: el propio usuario puede leer su fila
create policy "user_credits_select_own"
  on public.user_credits for select
  using (auth.uid() = user_id);

-- credit_transactions: el propio usuario puede ver las suyas
create policy "credit_transactions_select_own"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

-- credit_packages: lectura pública
create policy "credit_packages_select_public"
  on public.credit_packages for select
  using (true);

-- credit_packages: solo admin/superadmin puede escribir
create policy "credit_packages_write_admin"
  on public.credit_packages for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'superadmin')
    )
  );

-- ---------- FUNCIONES SECURITY DEFINER ----------

-- Devuelve el saldo actual (0 si no existe fila)
create or replace function public.get_credit_balance(p_user_id uuid)
returns numeric
language sql
security definer
stable
as $$
  select coalesce(
    (select balance from public.user_credits where user_id = p_user_id),
    0
  );
$$;

-- Añade créditos al saldo (crea la fila si no existe) y registra la transacción
create or replace function public.add_credits(
  p_user_id    uuid,
  p_credits    numeric,
  p_description text default null,
  p_order_id   uuid default null
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.user_credits (user_id, balance, updated_at)
    values (p_user_id, p_credits, now())
  on conflict (user_id) do update
    set balance    = user_credits.balance + excluded.balance,
        updated_at = now();

  insert into public.credit_transactions (user_id, type, credits, description, order_id)
    values (p_user_id, 'purchase', p_credits, p_description, p_order_id);
end;
$$;

-- Descuenta créditos. Devuelve false si saldo insuficiente, true si ok.
create or replace function public.spend_credits(
  p_user_id   uuid,
  p_credits   numeric,
  p_listing_id uuid default null,
  p_description text default null
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_balance numeric;
begin
  select balance into v_balance
    from public.user_credits
    where user_id = p_user_id
    for update;

  if v_balance is null or v_balance < p_credits then
    return false;
  end if;

  update public.user_credits
    set balance    = balance - p_credits,
        updated_at = now()
    where user_id = p_user_id;

  insert into public.credit_transactions (user_id, type, credits, description, listing_id)
    values (p_user_id, 'spend', -p_credits, coalesce(p_description, 'Publicación de aviso'), p_listing_id);

  return true;
end;
$$;

-- Devuelve total gastado (suma de créditos tipo 'spend', en positivo)
create or replace function public.get_credits_spent(p_user_id uuid)
returns numeric
language sql
security definer
stable
as $$
  select coalesce(sum(abs(credits)), 0)
    from public.credit_transactions
    where user_id = p_user_id
      and type = 'spend';
$$;

-- Grant de ejecución para usuarios autenticados
grant execute on function public.get_credit_balance(uuid) to authenticated;
grant execute on function public.add_credits(uuid, numeric, text, uuid) to authenticated;
grant execute on function public.spend_credits(uuid, numeric, uuid, text) to authenticated;
grant execute on function public.get_credits_spent(uuid) to authenticated;

-- ---------- SEED — paquetes de créditos por defecto ----------
insert into public.credit_packages (name, credits_amount, price_soles, sort_order) values
  ('Starter',  20,  20.00, 1),
  ('Básico',   50,  45.00, 2),
  ('Pro',     100,  85.00, 3),
  ('Premium', 200, 160.00, 4);
