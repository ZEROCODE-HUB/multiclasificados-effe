-- =====================================================================
-- 0142_los_cobros_por_yape_y_plin_son_ingresos.sql
--
-- LO QUE REPORTÓ EL CLIENTE, y tenía razón a medias — pero la mitad que tenía
-- razón vale S/ 3.608,54:
--
--   "en Ingresos no cuadra: cuando otorgo saldo a un usuario, o le quito saldo,
--    o el usuario crea un aviso con Yape o Plin y lo apruebo desde el admin, no
--    se está modificando el monto de ingresos"
--
-- ── LO QUE SÍ ES UN FALLO: YAPE Y PLIN ────────────────────────────────
--
-- `admin_stats` y `admin_growth_series` cuentan como ingreso esto:
--
--     and o.payment_provider = 'izipay'
--
-- Ese filtro lo puso la 0094 y era correcto ENTONCES: en agosto la pasarela era
-- la única forma de cobrar. El cobro manual por billetera llegó después, con la
-- 0117 (19-ago), y nadie volvió a estas dos funciones.
--
-- Así que desde entonces el panel se deja fuera dinero que entró de verdad: un
-- usuario paga por Yape, alguien del equipo comprueba el voucher y lo aprueba, y
-- el importe no aparece en ninguna parte. Hoy en producción son:
--
--     yape   10 órdenes pagadas   S/ 3.008,97
--     plin    6 órdenes pagadas   S/   599,57
--                                 ─────────────
--                                 S/ 3.608,54  invisibles
--
-- Es el mismo tipo de olvido que la marca `expiry_notified_85_at` de la 0140: se
-- añade una forma nueva de hacer algo y no se revisa quién más miraba la vieja.
--
-- ── LO QUE NO ES UN FALLO: OTORGAR Y QUITAR SALDO ─────────────────────
--
-- Otorgar saldo desde el panel NO es un ingreso, y por eso no mueve la cifra.
-- No entra dinero: se regala crédito. Hoy hay 28 movimientos "Otorgado por
-- admin" por 201.798 créditos, ninguno con orden detrás.
--
-- Y contarlos sería volver al problema que arregló la 0094: la tarjeta decía
-- S/ 5.373,74 cuando se habían cobrado S/ 145,77, justo porque sumaba el
-- crédito regalado, el backfill y las pruebas. Quitar saldo, igual pero al
-- revés.
--
-- Si el equipo usa "otorgar saldo" para registrar un cobro por fuera (una
-- transferencia bancaria, por ejemplo), ese dinero no lo puede ver esta cifra:
-- haría falta anotar el cobro como orden. Es una decisión de producto, no algo
-- que arregle una migración.
--
-- ── CÓMO QUEDA ───────────────────────────────────────────────────────
--
-- El filtro deja de estar copiado en tres sitios y pasa a una vista,
-- `cobros_reales`. El día que entre otra forma de cobrar, se añade AHÍ y las dos
-- pantallas se enteran solas — que es lo que no pasó con Yape y Plin.
--
-- `create or replace` en las dos funciones: conserva firma, tipo de retorno y
-- PERMISOS. Nada de DROP + CREATE (ver la 0136).
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Qué cuenta como ingreso, en un solo sitio ----------
create or replace view public.cobros_reales as
  select
    o.id,
    o.user_id,
    o.total,
    o.payment_provider,
    -- La fecha del COBRO, no la de creación del carrito. `coalesce` porque las
    -- órdenes más viejas no tienen `paid_at`.
    coalesce(o.paid_at, o.created_at) as cobrado_at
  from public.orders o
  where o.status = 'paid'
    -- Las tres formas de cobrar que existen hoy. `creditos` NO va: esa orden se
    -- pagó con saldo que ya se compró antes, y contarla sería cobrar dos veces
    -- el mismo dinero. `backfill` y `simulado` tampoco, y las órdenes sin
    -- proveedor (anteriores al 12-ago) se quedan fuera como desde la 0094.
    and o.payment_provider in ('izipay', 'yape', 'plin')
    -- Con referencia de la transacción y sin la marca de las pruebas.
    and o.payment_ref is not null
    and o.payment_ref <> 'SIMULADO';

comment on view public.cobros_reales is
  'Órdenes que representan dinero que entró de verdad: pasarela (izipay) y '
  'billetera aprobada a mano (yape/plin). Excluye el saldo regalado por un '
  'admin, las órdenes pagadas con saldo ya comprado, el backfill y las pruebas. '
  'Es la ÚNICA definición de "ingreso": si aparece otra forma de cobrar, se '
  'añade aquí y no en cada función.';

-- Una vista nueva en `public` NACE con ALL para anon y authenticated (los
-- `alter default privileges` de Supabase), y además una vista corre con los
-- permisos de SU DUEÑO: se saltaría la RLS de `orders`. O sea que sin esto,
-- cualquiera con la llave anónima —que viaja en el paquete de la web— podría
-- leer la facturación entera. Ver la migración 0137.
revoke all on public.cobros_reales from public, anon, authenticated;

-- ---------- 2. La tarjeta de Ingresos del panel ----------
create or replace function public.admin_stats()
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  with t as (
    -- Ventana móvil: se recalcula sola cada día.
    select (now() - interval '30 days') as t0
  )
  select case when public.is_staff(auth.uid()) then jsonb_build_object(

    'window_days', 30,

    -- ── Usuarios ── exacto: profiles guarda created_at.
    'users',      (select count(*) from public.profiles),
    'users_prev', (select count(*) from public.profiles p, t where p.created_at <= t.t0),

    -- ── Avisos ──
    'active_listings',  (select count(*) from public.listings where status = 'active'),
    -- Aproximación honesta: cuántos estaban VIGENTES hace 30 días, según sus
    -- propias fechas. No puede ver los que se borraron desde entonces (ya no
    -- están en la tabla), pero no inventa nada.
    'active_listings_prev', (
      select count(*) from public.listings l, t
       where l.published_at <= t.t0
         and (l.expires_at is null or l.expires_at > t.t0)
    ),

    'pending_listings', (select count(*) from public.listings where status = 'pending'),

    'sold_listings', (select count(*) from public.listings where status = 'sold'),
    -- Aquí la aproximación es más gruesa: no existe `sold_at`, así que se usa
    -- la última modificación. Un aviso vendido y editado después contaría como
    -- vendido más tarde de lo que fue. Es lo mejor que permite el esquema.
    'sold_listings_prev', (
      select count(*) from public.listings l, t
       where l.status = 'sold' and l.updated_at <= t.t0
    ),

    'total_listings', (select count(*) from public.listings),

    -- ── Reportes abiertos ── exacto: reports guarda resolved_at, así que se
    -- sabe cuáles seguían abiertos en aquel momento.
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'reports_open_prev', (
      select count(*) from public.reports r, t
       where r.created_at <= t.t0
         and (r.resolved_at is null or r.resolved_at > t.t0)
    ),

    -- ── Ingresos ── lo cobrado de verdad, por la pasarela Y por billetera.
    -- La definición vive en `cobros_reales`, la misma que usa el gráfico de
    -- Reportes, para que la tarjeta y el gráfico no puedan decir cosas
    -- distintas. Antes el filtro estaba escrito a mano en los dos sitios y por
    -- eso Yape y Plin se quedaron fuera de los dos.
    'revenue', coalesce((select sum(c.total) from public.cobros_reales c), 0),
    'revenue_prev', coalesce((
      select sum(c.total) from public.cobros_reales c, t
       where c.cobrado_at <= t.t0
    ), 0)

  ) else '{}'::jsonb end;
$function$;

-- ---------- 3. El gráfico de ingresos de Reportes ----------
create or replace function public.admin_growth_series(p_range text default '6m'::text)
returns table(mes text, ingresos numeric, usuarios bigint, avisos bigint, postulaciones bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz       constant text   := 'America/Lima';
  v_meses    constant text[] := array['Ene','Feb','Mar','Abr','May','Jun',
                                      'Jul','Ago','Set','Oct','Nov','Dic'];
  v_range    text := coalesce(p_range, '6m');
  v_diario   boolean;
  v_bucket   text;
  v_paso     interval;
  v_con_anio boolean;
  v_ahora    timestamp;
  v_desde    timestamp;
begin
  if not public.is_staff(auth.uid()) then
    return;
  end if;

  if v_range not in ('7d', '30d', '6m', '12m', 'all') then
    v_range := '6m';
  end if;

  v_diario   := v_range in ('7d', '30d');
  v_bucket   := case when v_diario then 'day' else 'month' end;
  v_paso     := case when v_diario then interval '1 day' else interval '1 month' end;
  v_con_anio := v_range in ('12m', 'all');

  v_ahora := date_trunc(v_bucket, (now() at time zone v_tz));

  if v_range = '7d' then
    v_desde := v_ahora - interval '6 days';
  elsif v_range = '30d' then
    v_desde := v_ahora - interval '29 days';
  elsif v_range = '6m' then
    v_desde := v_ahora - interval '5 months';
  elsif v_range = '12m' then
    v_desde := v_ahora - interval '11 months';
  else
    select date_trunc('month', (least(
             coalesce((select min(o.created_at) from public.orders   o), now()),
             coalesce((select min(p.created_at) from public.profiles p), now())
           ) at time zone v_tz))
      into v_desde;
    v_desde := greatest(v_desde, v_ahora - interval '5 years');
  end if;

  return query
  with buckets as (
    select generate_series(v_desde, v_ahora, v_paso) as m
  )
  select
    case
      when v_diario then to_char(b.m, 'DD/MM')
      else v_meses[extract(month from b.m)::int]
           || case when v_con_anio then ' ' || to_char(b.m, 'YY') else '' end
    end as mes,
    coalesce((
      -- La MISMA definición de ingreso que la tarjeta del panel.
      select sum(c.total) from public.cobros_reales c
      where date_trunc(v_bucket, (c.cobrado_at at time zone v_tz)) = b.m
    ), 0)::numeric as ingresos,
    (
      select count(*) from public.profiles p
      where date_trunc(v_bucket, (p.created_at at time zone v_tz)) = b.m
    )::bigint as usuarios,
    (
      select count(*) from public.listings l
      where date_trunc(v_bucket, (l.created_at at time zone v_tz)) = b.m
    )::bigint as avisos,
    (
      select count(*) from public.job_applications a
      where date_trunc(v_bucket, (a.created_at at time zone v_tz)) = b.m
    )::bigint as postulaciones
  from buckets b
  order by b.m;
end;
$function$;
