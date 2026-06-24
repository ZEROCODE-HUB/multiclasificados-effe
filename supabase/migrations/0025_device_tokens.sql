-- =====================================================================
-- 0025_device_tokens.sql — Push móvil (FCM)
-- Guarda el token de notificaciones push de cada dispositivo por usuario.
-- La Edge Function `send-push` lee estos tokens para enviar a FCM.
-- Idempotente.
-- =====================================================================

create table if not exists public.device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null unique,
  platform   text not null default 'android',   -- android | ios | web
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- Cada usuario administra sus propios tokens (insertar/actualizar/borrar).
drop policy if exists "device_tokens_own" on public.device_tokens;
create policy "device_tokens_own" on public.device_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Registrar/actualizar el token del dispositivo del usuario actual.
create or replace function public.register_device_token(p_token text, p_platform text default 'android')
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'no autenticado';
  end if;
  insert into public.device_tokens (user_id, token, platform, updated_at)
  values (auth.uid(), p_token, p_platform, now())
  on conflict (token) do update
    set user_id = auth.uid(), platform = p_platform, updated_at = now();
end;
$$;

grant execute on function public.register_device_token(text, text) to authenticated;
