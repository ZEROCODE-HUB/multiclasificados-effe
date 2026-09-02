-- =====================================================================
-- 0143_el_saldo_que_si_fue_un_cobro.sql
--
-- Segunda mitad de lo que reportó el cliente en "Ingresos" (la primera fue la
-- 0142, Yape y Plin). Aquí:
--
--   "Acabo de otorgar saldo a un usuario, y no se aumentó el monto del gráfico"
--
-- Y detrás hay algo real: el equipo usa "otorgar saldo" para registrar dinero
-- que entró POR FUERA de la plataforma —una transferencia, efectivo—, así que
-- ese dinero es un ingreso de verdad y no se veía en ninguna parte.
--
-- ── POR QUÉ NO BASTA CON CONTAR TODOS LOS OTORGAMIENTOS ──────────────
--
-- Porque "otorgar saldo" se usa para dos cosas que no se parecen en nada, y hoy
-- no hay forma de distinguirlas. Esto es lo que hay guardado en producción:
--
--     julio        12.994 créditos   casi todo [QA-FIXTURE]
--     agosto      188.911 créditos   "Cliente nuevo", "Prueba de QA tras
--                                     migración 0108", varios sin motivo
--     septiembre      400 créditos   "ingreso" (las pruebas del cliente)
--
-- Contarlos todos llevaría "Ingresos" de S/ 24.732 a más de S/ 226.000, y
-- 188.911 de esos son regalos y pruebas. Sería volver exactamente al problema
-- que arregló la 0094: la tarjeta decía S/ 5.373,74 con S/ 145,77 cobrados.
--
-- ── CÓMO QUEDA ───────────────────────────────────────────────────────
--
-- Se marca al mover el saldo. Una columna, `cobro_medio`:
--
--     null                 regalo, prueba, compensación → NO es ingreso
--     'transferencia'…     entró (o salió) dinero de verdad → SÍ cuenta
--
-- Y el SIGNO lo pone el movimiento: otorgar suma, quitar resta. Así una
-- devolución de dinero de verdad descuenta del ingreso sin ninguna regla
-- aparte, que es justo lo que debe pasar.
--
-- Lo histórico se queda fuera —eran regalos y pruebas— y eso es lo correcto:
-- reetiquetarlo a mano hoy sería inventarse la contabilidad de dos meses.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. La marca ----------
alter table public.credit_transactions
  add column if not exists cobro_medio text;

comment on column public.credit_transactions.cobro_medio is
  'Cuando el movimiento de saldo corresponde a dinero que entró o salió DE '
  'VERDAD por fuera de la plataforma, el medio por el que se cobró o devolvió. '
  'NULL significa que fue un regalo, una prueba o una compensación, y entonces '
  'no cuenta como ingreso. Lo lee la vista `cobros_reales`.';

-- Los medios admitidos. Va como CHECK y no como enum a propósito: añadir uno
-- nuevo a un enum obliga a un `alter type` que no se puede deshacer dentro de
-- una transacción, y esta lista va a crecer.
alter table public.credit_transactions
  drop constraint if exists credit_transactions_cobro_medio_check;
alter table public.credit_transactions
  add constraint credit_transactions_cobro_medio_check
  check (cobro_medio is null or cobro_medio in
    ('transferencia', 'efectivo', 'yape', 'plin', 'deposito', 'otro'));

-- ---------- 2. Qué cuenta como ingreso ----------
-- DROP + CREATE y no `create or replace`: cambia el nombre de una columna
-- (`payment_provider` pasa a `origen`, porque ya no siempre es una pasarela) y
-- eso `replace` no lo admite. La vista es de ayer (0142) y solo la usan las dos
-- funciones de abajo, que se reescriben aquí mismo.
drop view if exists public.cobros_reales;

create view public.cobros_reales as
  -- (a) Lo cobrado por la plataforma: pasarela y billetera aprobada a mano.
  select
    o.id,
    o.user_id,
    o.total,
    o.payment_provider as origen,
    coalesce(o.paid_at, o.created_at) as cobrado_at
  from public.orders o
  where o.status = 'paid'
    and o.payment_provider in ('izipay', 'yape', 'plin')
    and o.payment_ref is not null
    and o.payment_ref <> 'SIMULADO'

  union all

  -- (b) Lo cobrado POR FUERA y registrado como movimiento de saldo, solo cuando
  --     quien lo registró marcó que hubo dinero. Sin marca no entra: es la
  --     única forma de separar un cobro real de un regalo o una prueba.
  --
  --     El signo viene del propio movimiento: otorgar suma y quitar resta, así
  --     que devolverle el dinero a alguien descuenta del ingreso sin necesidad
  --     de ninguna regla aparte.
  select
    ct.id,
    ct.user_id,
    ct.credits as total,
    ct.cobro_medio as origen,
    ct.created_at as cobrado_at
  from public.credit_transactions ct
  where ct.cobro_medio is not null;

comment on view public.cobros_reales is
  'Dinero que entró (o salió) de verdad. Dos orígenes: las órdenes cobradas por '
  'la plataforma —pasarela y billetera— y los movimientos de saldo que el '
  'equipo marcó como cobro real por fuera. Excluye el saldo regalado, las '
  'órdenes pagadas con saldo ya comprado, el backfill y las pruebas. Es la '
  'ÚNICA definición de "ingreso": si aparece otra forma de cobrar, se añade '
  'aquí y no en cada función.';

-- Una vista nueva en `public` NACE con ALL para anon y authenticated (los
-- `alter default privileges` de Supabase) y ADEMÁS corre con los permisos de su
-- dueño, así que se salta la RLS. Sin esto, cualquiera con la llave anónima
-- —que viaja en el paquete de la web— leería la facturación entera. Ver la 0137.
revoke all on public.cobros_reales from public, anon, authenticated;

-- ---------- 3. Mover el saldo, diciendo si hubo dinero ----------
-- La firma pasa de 3 a 4 argumentos. Se hace con DROP + CREATE y no añadiendo
-- una sobrecarga: PostgREST resuelve las sobrecargas por el nombre de los
-- parámetros y con dos versiones conviviendo acaba eligiendo la que no toca. El
-- EXECUTE se vuelve a conceder abajo, que es lo que se pierde con un DROP
-- (ver la 0136).
drop function if exists public.admin_ajustar_saldo(uuid, numeric, text);

create or replace function public.admin_ajustar_saldo(
  p_user        uuid,
  p_delta       numeric,
  p_motivo      text,
  -- Null = regalo, prueba o compensación. Con valor = entró o salió dinero de
  -- verdad, y entonces cuenta en "Ingresos".
  p_cobro_medio text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_antes numeric;
  v_despues numeric;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_medio text := nullif(btrim(coalesce(p_cobro_medio, '')), '');
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
  -- Se valida aquí y no solo en el CHECK para dar un mensaje legible: el error
  -- de una restricción llega al panel como un texto de Postgres.
  if v_medio is not null and v_medio not in ('transferencia', 'efectivo', 'yape', 'plin', 'deposito', 'otro') then
    raise exception 'medio de cobro no válido: %', v_medio using errcode = 'EF021';
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

  insert into public.credit_transactions (user_id, type, credits, description, cobro_medio)
    values (
      p_user,
      case when p_delta > 0 then 'purchase' else 'refund' end,
      p_delta,
      case when p_delta > 0 then 'Otorgado por admin: ' else 'Retirado por admin: ' end || v_motivo,
      v_medio
    );

  select coalesce(balance, 0) into v_despues from public.user_credits where user_id = p_user;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    values (
      auth.uid(),
      case when p_delta > 0 then 'grant_credits' else 'revoke_credits' end,
      'user', p_user,
      jsonb_build_object('credits', p_delta, 'reason', v_motivo,
                         'saldo_anterior', v_antes, 'saldo', v_despues,
                         -- En la auditoría también: es la diferencia entre un
                         -- regalo y un cobro, y eso hay que poder rastrearlo.
                         'cobro_medio', v_medio)
    );

  return jsonb_build_object('saldo_anterior', v_antes, 'saldo', v_despues,
                            'delta', p_delta, 'cobro_medio', v_medio);
end;
$function$;

-- Lo que el DROP se llevó. Sin esto, mover el saldo desde el panel devuelve un
-- 42501 que el front enseña como un error genérico.
revoke execute on function public.admin_ajustar_saldo(uuid, numeric, text, text) from public, anon;
grant  execute on function public.admin_ajustar_saldo(uuid, numeric, text, text) to authenticated, service_role;

-- `admin_grant_credits` delegaba en la firma de 3 argumentos, que ya no existe.
-- Se reescribe para que apunte a la nueva; sigue sin marcar cobro (quien la use
-- está otorgando, no registrando un ingreso).
create or replace function public.admin_grant_credits(
  p_user uuid, p_credits numeric, p_reason text default null::text
)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'la cantidad debe ser mayor a 0' using errcode = 'EF021';
  end if;
  v := public.admin_ajustar_saldo(p_user, p_credits,
                                  coalesce(nullif(btrim(p_reason), ''), 'sin motivo indicado'),
                                  null);
  return (v ->> 'saldo')::numeric;
end;
$function$;
