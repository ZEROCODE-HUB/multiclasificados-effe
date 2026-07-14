-- =====================================================================
-- 0057_confidential_counterpart_email.sql
-- En un aviso CONFIDENCIAL la identidad del anunciante está protegida. En la
-- mensajería, en vez del nombre real del anunciante (que además hoy se filtra
-- vía public_profiles.full_name) se muestra su CORREO, y solo lo ve el comprador
-- de esa conversación.
--
-- Este RPC devuelve, para el usuario autenticado, el correo del ANUNCIANTE
-- (seller) de sus conversaciones cuyo aviso es confidencial — y solo cuando el
-- que llama es el COMPRADOR (buyer). Así el correo del vendedor nunca se expone
-- a terceros: únicamente a su contraparte en el chat. Idempotente.
-- =====================================================================

create or replace function public.confidential_counterpart_emails()
returns table (conversation_id uuid, email text)
language sql
security definer
set search_path = public
as $$
  select c.id, p.email
  from public.conversations c
  join public.listings l on l.id = c.listing_id and l.confidential = true
  join public.profiles  p on p.id = c.seller_id
  where c.buyer_id = auth.uid()
    and p.email is not null;
$$;

revoke execute on function public.confidential_counterpart_emails() from public, anon;
grant  execute on function public.confidential_counterpart_emails() to authenticated;
