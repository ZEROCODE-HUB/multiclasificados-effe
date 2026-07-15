-- =====================================================================
-- 0066_grant_credits_matrix.sql — admin_grant_credits al control de versiones
--
-- admin_grant_credits ("Otorgar saldo" en Gestión de usuarios) existía SOLO en
-- la base remota: ninguna migración del repo lo definía, así que la BD no se
-- podía reconstruir desde cero y su guard no era auditable. Esta migración:
--   1) lo trae al repo (cuerpo idéntico al de producción), y
--   2) alinea su guard is_staff → has_perm('Gestión de usuarios','edit'), la
--      misma acción que ya gobierna suspender/reactivar/reset (admin_set_user_
--      status). Antes, cualquier is_staff (incl. soporte) podía otorgar saldo
--      pese a que la matriz le niega "editar" usuarios.
--
-- has_perm ya es true para el superadmin. admin y moderador conservan la acción
-- (seed: edit=true en usuarios); soporte deja de poder (edit=false). Idempotente.
-- =====================================================================

create or replace function public.admin_grant_credits(
  p_user    uuid,
  p_credits numeric,
  p_reason  text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if not public.has_perm('Gestión de usuarios', 'edit') then
    raise exception 'no tienes permiso para otorgar saldo';
  end if;
  if p_credits is null or p_credits <= 0 then
    raise exception 'la cantidad debe ser mayor a 0';
  end if;

  insert into public.user_credits (user_id, balance, updated_at)
    values (p_user, p_credits, now())
  on conflict (user_id) do update
    set balance = user_credits.balance + excluded.balance,
        updated_at = now();

  insert into public.credit_transactions (user_id, type, credits, description)
    values (p_user, 'purchase', p_credits, coalesce('Otorgado por admin: ' || p_reason, 'Otorgado por admin'));

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'grant_credits', 'user', p_user, jsonb_build_object('credits', p_credits, 'reason', p_reason));

  select balance into v_balance from public.user_credits where user_id = p_user;
  return v_balance;
end;
$$;

grant execute on function public.admin_grant_credits(uuid, numeric, text) to authenticated;
