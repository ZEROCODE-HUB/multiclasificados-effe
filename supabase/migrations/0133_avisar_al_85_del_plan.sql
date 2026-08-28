-- =====================================================================
-- 0133_avisar_al_85_del_plan.sql
--
-- LO QUE REPORTÓ EL CLIENTE:
--
--   "El mismo aviso, a los 20 segundos de colocarlo, emitió una alerta que ya
--    está por vencer. Me parece que debemos manejar el tiempo contratado en
--    horas de duración del aviso. Luego al verificar, emitir alertas solo
--    cuando haya pasado el 85% de tiempo contratado, y en las alertas y correos
--    colocamos el tiempo transcurrido y lo que le queda."
--
-- Tenía razón y el motivo es de una sola línea. La 0113 avisa así:
--
--     and expires_at <= now() + interval '3 days'
--
-- Es un umbral ABSOLUTO. Su aviso era de un plan de 3 días, así que la
-- condición se cumplía en el mismo segundo de publicarlo: el aviso nacía "por
-- vencer" y salía el correo. Con planes de 30 días el mismo umbral falla al
-- revés — tres días de margen sobre treinta es avisar demasiado tarde para
-- decidir con calma.
--
-- Medido sobre el tiempo CONTRATADO la regla vale para cualquier plan:
--
--     plan de  3 días  ->  avisa cuando quedan ~11 horas
--     plan de  7 días  ->  avisa cuando queda  ~1 día
--     plan de 30 días  ->  avisa cuando quedan ~4 días y medio
--
-- La duración sale de `plan_duration_days`, que ya se guarda desde la 0041. Si
-- un aviso antiguo no la tiene, se deduce de la distancia entre su publicación
-- y su vencimiento, que es lo mismo por otro camino.
--
-- Y el aviso lleva ahora las dos cifras que pidió: cuánto lleva publicado y
-- cuánto le queda.
--
-- Idempotente.
-- =====================================================================

-- Marca propia y NO se reutiliza `expiry_notified_3d_at`: los avisos que ya
-- recibieron la alerta prematura la tienen puesta, y reutilizándola se
-- quedarían sin recibir nunca la correcta.
alter table public.listings add column if not exists expiry_notified_85_at timestamptz;

comment on column public.listings.expiry_notified_85_at is
  'Cuándo se avisó al consumir el 85 % del tiempo contratado. Sustituye a '
  'expiry_notified_3d_at, que disparaba a 3 días fijos del vencimiento y en un '
  'plan de 3 días saltaba al publicar.';

create or replace function public.notify_expiring_listings()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count int := 0;
  -- La parte del plan que hay que haber consumido para que valga la pena
  -- avisar. Es el número que pidió el cliente.
  c_umbral constant numeric := 0.85;
begin
  -- (a) Al 85 % del tiempo contratado: queda margen para decidir si se renueva,
  --     y en un plan corto no salta nada más publicar.
  for v_row in
    select *
    from (
      select
        l.id, l.owner_id, l.title, l.expires_at,
        coalesce(
          (l.plan_duration_days || ' days')::interval,
          -- Aviso sin plan guardado (anteriores a la 0041): la duración es la
          -- distancia entre cuando se publicó y cuando caduca.
          l.expires_at - coalesce(l.published_at, l.created_at)
        ) as duracion
      from public.listings l
      where l.status = 'active'
        and l.expires_at is not null
        and l.expiry_notified_85_at is null
        and l.expires_at > now()
    ) t
    where t.duracion is not null
      and t.duracion > interval '0'
      and now() >= t.expires_at - (t.duracion * (1 - c_umbral))
  loop
    perform public.notify_user(
      v_row.owner_id,
      'listing_expiring',
      'Tu aviso está por vencer',
      jsonb_build_object(
        'listing_id', v_row.id,
        'listing_title', v_row.title,
        'expires_at', v_row.expires_at,
        -- `dias` se mantiene: los avisos ya guardados lo llevan y los textos
        -- siguen sabiendo leerlo.
        'dias', greatest(1, ceil(extract(epoch from (v_row.expires_at - now())) / 86400)::int),
        -- Las dos cifras que pidió el cliente, en horas para que no se pierdan
        -- en el redondeo a días de los planes cortos.
        'horas_totales',      round(extract(epoch from v_row.duracion) / 3600)::int,
        'horas_restantes',    greatest(0, floor(extract(epoch from (v_row.expires_at - now())) / 3600)::int),
        'horas_transcurridas', greatest(0, round(extract(epoch from (v_row.duracion - (v_row.expires_at - now()))) / 3600)::int)
      )
    );
    update public.listings set expiry_notified_85_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  -- (b) Última hora: el recordatorio de siempre, para quien no reaccionó.
  for v_row in
    select
      l.id, l.owner_id, l.title, l.expires_at,
      coalesce(
        (l.plan_duration_days || ' days')::interval,
        l.expires_at - coalesce(l.published_at, l.created_at)
      ) as duracion
    from public.listings l
    where l.status = 'active'
      and l.expires_at is not null
      and l.expiry_notified_at is null
      and l.expires_at > now()
      and l.expires_at <= now() + interval '1 hour'
  loop
    perform public.notify_user(
      v_row.owner_id,
      'listing_expiring',
      'Tu aviso está por vencer',
      jsonb_build_object(
        'listing_id', v_row.id,
        'listing_title', v_row.title,
        'expires_at', v_row.expires_at,
        'horas_totales',      case when v_row.duracion is null then null
                                   else round(extract(epoch from v_row.duracion) / 3600)::int end,
        'horas_restantes',    greatest(0, floor(extract(epoch from (v_row.expires_at - now())) / 3600)::int),
        'horas_transcurridas', case when v_row.duracion is null then null
                                    else greatest(0, round(extract(epoch from (v_row.duracion - (v_row.expires_at - now()))) / 3600)::int) end
      )
    );
    update public.listings set expiry_notified_at = now() where id = v_row.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- El cron la llama con service_role; nadie más tiene por qué dispararla.
revoke execute on function public.notify_expiring_listings() from public;
grant  execute on function public.notify_expiring_listings() to service_role;

comment on function public.notify_expiring_listings() is
  'Avisa al dueño cuando su aviso consumió el 85 % del tiempo contratado, y '
  'otra vez en la última hora. El aviso lleva cuánto lleva publicado y cuánto '
  'le queda.';
