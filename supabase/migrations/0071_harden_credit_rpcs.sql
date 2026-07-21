-- =====================================================================
-- Endurecimiento de los RPC de créditos (hueco crítico hallado 2026-07-21).
--
-- 1) add_credits() acreditaba créditos SIN NINGÚN guard y estaba ejecutable por
--    PUBLIC / anon / authenticated. Es decir: CUALQUIERA (incluso sin sesión)
--    podía llamar add_credits(cualquier_uuid, 999999) por la API RPC y regalar
--    créditos, saltándose el pago por completo. La ÚNICA vía legítima es
--    settle_paid_order() (SECURITY DEFINER → corre como el owner) tras un pago
--    validado por el webhook; el front nunca la llama. Se revoca de todos menos
--    del owner/service_role. settle_paid_order sigue funcionando porque corre con
--    privilegios del owner.
--
-- 2) spend_credits() aceptaba cualquier p_user_id: un usuario autenticado podía
--    DRENAR los créditos de otro. El front siempre pasa auth.uid() y no hay
--    llamador server-side con otro id, así que se agrega el guard.
-- =====================================================================

revoke execute on function public.add_credits(uuid, numeric, text, uuid) from public;
revoke execute on function public.add_credits(uuid, numeric, text, uuid) from anon;
revoke execute on function public.add_credits(uuid, numeric, text, uuid) from authenticated;

create or replace function public.spend_credits(
  p_user_id    uuid,
  p_credits    numeric,
  p_listing_id uuid default null,
  p_description text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  -- Solo puedes gastar TUS propios créditos.
  if p_user_id is distinct from auth.uid() then
    raise exception 'no autorizado';
  end if;

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
