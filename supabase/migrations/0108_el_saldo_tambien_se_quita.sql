-- =====================================================================
-- 0108_el_saldo_tambien_se_quita.sql — Gestión de usuarios puede devolver
-- saldo, no solo otorgarlo.
--
-- Hasta hoy `admin_grant_credits` rechazaba cualquier cantidad <= 0, así que la
-- única forma de retirarle saldo a alguien era anular un comprobante (0101), lo
-- que además emite una nota de crédito ante SUNAT. Para una devolución
-- acordada, un abono duplicado o un ajuste, eso no sirve: hay que poder mover el
-- saldo en los dos sentidos desde la ficha del usuario.
--
-- Decisiones:
--   · El MOTIVO pasa a ser obligatorio, también al otorgar. Es dinero: un
--     movimiento sin explicación no se puede auditar después, y hasta ahora el
--     panel ni siquiera enviaba el motivo que la función ya aceptaba.
--   · La retirada usa el tipo 'refund' (el mismo de la anulación, 0101), no un
--     'spend' negativo: `get_credits_spent` suma los 'spend' en valor absoluto y
--     contaría la devolución como consumo del usuario.
--   · Si el saldo no alcanza, se rechaza (EF020) en vez de dejarlo en cero: que
--     quien administra vea la cifra real y decida, igual que hace la anulación.
--   · `admin_grant_credits` se conserva como envoltorio para no romper a nadie.
--
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

-- ---------- Consultar el saldo de otro usuario ----------
-- `user_credits` tiene RLS de "solo lo mío" (0035), así que el panel no puede
-- leer el saldo del usuario al que va a ajustar. Sin esto, quien administra
-- decide a ciegas.
create or replace function public.admin_saldo_usuario(p_user uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo numeric;
begin
  if not public.has_perm('Gestión de usuarios', 'view') then
    raise exception 'no tienes permiso para ver el saldo' using errcode = 'EF022';
  end if;
  select coalesce(balance, 0) into v_saldo from public.user_credits where user_id = p_user;
  return coalesce(v_saldo, 0);
end;
$$;

-- ---------- Ajustar el saldo en cualquier sentido ----------
create or replace function public.admin_ajustar_saldo(
  p_user   uuid,
  p_delta  numeric,   -- positivo otorga, negativo retira
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes numeric;
  v_despues numeric;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not public.has_perm('Gestión de usuarios', 'edit') then
    raise exception 'no tienes permiso para mover el saldo' using errcode = 'EF022';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'indica cuánto saldo quieres otorgar o quitar' using errcode = 'EF021';
  end if;
  if v_motivo = '' then
    raise exception 'el motivo es obligatorio: es dinero y tiene que quedar explicado' using errcode = 'EF021';
  end if;
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'el usuario no existe' using errcode = 'EF021';
  end if;

  -- Bloqueo de la fila mientras se decide: dos ajustes a la vez sobre el mismo
  -- usuario podrían leer el mismo saldo y dejarlo mal.
  select coalesce(balance, 0) into v_antes from public.user_credits where user_id = p_user for update;
  v_antes := coalesce(v_antes, 0);

  if v_antes + p_delta < 0 then
    raise exception 'El usuario solo tiene % de saldo y quieres retirar %.', v_antes, abs(p_delta)
      using errcode = 'EF020';
  end if;

  -- En dos pasos, y no con `insert ... on conflict do update`: Postgres
  -- comprueba el CHECK (balance >= 0) contra la fila PROPUESTA antes de
  -- detectar el conflicto, así que una retirada de 30 sobre un saldo de 100
  -- reventaba por intentar insertar -30. Aquí la fila se asegura primero y el
  -- movimiento se aplica sobre el saldo que ya hay.
  insert into public.user_credits (user_id, balance, updated_at)
    values (p_user, 0, now())
  on conflict (user_id) do nothing;

  update public.user_credits
     set balance = balance + p_delta, updated_at = now()
   where user_id = p_user;

  insert into public.credit_transactions (user_id, type, credits, description)
    values (
      p_user,
      case when p_delta > 0 then 'purchase' else 'refund' end,
      p_delta,
      case when p_delta > 0 then 'Otorgado por admin: ' else 'Retirado por admin: ' end || v_motivo
    );

  select coalesce(balance, 0) into v_despues from public.user_credits where user_id = p_user;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      case when p_delta > 0 then 'grant_credits' else 'revoke_credits' end,
      'user', p_user,
      jsonb_build_object('credits', p_delta, 'reason', v_motivo,
                         'saldo_anterior', v_antes, 'saldo', v_despues)
    );

  return jsonb_build_object('saldo_anterior', v_antes, 'saldo', v_despues, 'delta', p_delta);
end;
$$;

-- ---------- El otorgar de siempre, ahora delegando ----------
-- Se mantiene la firma y el valor de retorno (el saldo nuevo) para no romper
-- ningún llamador existente.
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
  v jsonb;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'la cantidad debe ser mayor a 0' using errcode = 'EF021';
  end if;
  v := public.admin_ajustar_saldo(p_user, p_credits, coalesce(nullif(btrim(p_reason), ''), 'sin motivo indicado'));
  return (v ->> 'saldo')::numeric;
end;
$$;

-- ---------- Permisos ----------
-- Por la 0104 una función nueva nace sin EXECUTE para `authenticated`: sin este
-- grant, el panel recibe un 42501. El permiso real lo decide `has_perm` dentro.
revoke execute on function public.admin_ajustar_saldo(uuid, numeric, text) from public;
revoke execute on function public.admin_ajustar_saldo(uuid, numeric, text) from anon;
grant  execute on function public.admin_ajustar_saldo(uuid, numeric, text) to authenticated, service_role;

revoke execute on function public.admin_saldo_usuario(uuid) from public;
revoke execute on function public.admin_saldo_usuario(uuid) from anon;
grant  execute on function public.admin_saldo_usuario(uuid) to authenticated, service_role;

revoke execute on function public.admin_grant_credits(uuid, numeric, text) from public;
revoke execute on function public.admin_grant_credits(uuid, numeric, text) from anon;
grant  execute on function public.admin_grant_credits(uuid, numeric, text) to authenticated, service_role;

comment on function public.admin_ajustar_saldo is
  'Mueve el saldo de un usuario desde Gestión de usuarios. Delta positivo otorga '
  '(''purchase''), negativo devuelve (''refund''). Motivo obligatorio; queda en '
  'credit_transactions y en audit_logs. EF020 si el retiro dejaría el saldo negativo.';
