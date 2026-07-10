-- =====================================================================
-- 0049_listing_expiry_notice.sql — Aviso "está por vencer"
-- Notifica al dueño ~1 hora antes de que su aviso caduque, con los datos
-- del aviso. Se apoya en notify_user (in-app + push según preferencias).
-- El cron que la ejecuta va aparte, en 0050 (como 0016/0017). Idempotente.
-- =====================================================================

-- Marca para no notificar dos veces el mismo aviso.
alter table public.listings add column if not exists expiry_notified_at timestamptz;

-- Recorre los avisos activos que caducan dentro de la próxima hora y aún no se
-- han avisado, notifica a su dueño y los marca. Devuelve cuántos notificó.
create or replace function public.notify_expiring_listings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count int := 0;
begin
  for v_row in
    select id, owner_id, title, expires_at
    from public.listings
    where status = 'active'
      and expires_at is not null
      and expiry_notified_at is null
      and expires_at > now()
      and expires_at <= now() + interval '1 hour'
  loop
    perform public.notify_user(
      v_row.owner_id,
      'listing_expiring',
      'Tu aviso está por vencer',
      jsonb_build_object(
        'listing_id', v_row.id,
        'listing_title', v_row.title,
        'expires_at', v_row.expires_at
      )
    );
    update public.listings set expiry_notified_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.notify_expiring_listings() from public;
grant  execute on function public.notify_expiring_listings() to service_role;
