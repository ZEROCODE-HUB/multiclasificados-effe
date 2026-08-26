-- =====================================================================
-- 0126_aviso_de_reclamo_en_la_campana.sql — punto B-08 de la auditoría
--
-- Cuando entra un reclamo al Libro de Reclamaciones solo salía un correo
-- interno a `RECLAMOS_TO`. Un correo entre otros cincuenta se pierde, y este no
-- es un correo cualquiera: el Reglamento del Libro de Reclamaciones da **treinta
-- días calendario** para responder, y el plazo corre desde que se registra, no
-- desde que alguien lo ve.
--
-- Ahora también aparece en la campana de Admin y Superadmin, que es donde se
-- mira a diario.
--
-- POR QUÉ UN TRIGGER Y NO UNA LLAMADA DESDE LA EDGE FUNCTION
--
-- Hoy los reclamos entran solo por `send-reclamo`, pero mañana pueden entrar
-- por otra vía —una carga a mano, una migración, un panel—. Colgado de la
-- tabla, el aviso sale se registre el reclamo por donde se registre. Y si se
-- añade un reclamo desde el editor SQL, también avisa.
--
-- LA NOTIFICACIÓN SE BASTA A SÍ MISMA, a propósito
--
-- No hay pantalla del Libro de Reclamaciones (es el punto B-09, aparcado), así
-- que un enlace no llevaría a ninguna parte. Por eso el aviso lleva **el código
-- de la hoja, el nombre y si es reclamo o queja**: con eso se puede buscar el
-- correo o llamar al consumidor sin depender de ninguna pantalla. El día que
-- exista B-09, se le añade el enlace y ya.
--
-- Idempotente.
-- =====================================================================

create or replace function public.avisar_reclamo_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_clase text;
  v_texto text;
begin
  -- "Reclamo" y "Queja" no son lo mismo ante Indecopi: el reclamo es
  -- disconformidad con el producto o servicio, la queja es por la atención.
  -- Quien lo lee necesita saber cuál es antes de abrir nada.
  v_clase := case when new.kind = 'queja' then 'Queja' else 'Reclamo' end;
  -- `code` es bigint: sin el cast, el `coalesce` con un texto no compila.
  v_texto := v_clase || ' N.º ' || coalesce(new.code::text, '—')
          || ' de ' || coalesce(nullif(btrim(new.full_name), ''), 'un consumidor');

  for v_uid in
    select user_id from public.user_roles where role in ('admin', 'superadmin')
  loop
    perform public.notify_user(
      v_uid,
      'complaint_new',
      'Nuevo ' || lower(v_clase) || ' en el Libro',
      jsonb_build_object(
        'complaint_id', new.id,
        'code',         new.code,
        'kind',         new.kind,
        'full_name',    new.full_name,
        'resumen',      v_texto
      )
    );
  end loop;

  return new;
exception
  when others then
    -- Un fallo avisando NO puede tumbar el registro del reclamo. La constancia
    -- para el consumidor es lo que exige la ley; la campana es comodidad
    -- nuestra. Si esto reventara, el reclamo se perdería y con él el plazo.
    raise warning 'No se pudo avisar del reclamo %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke execute on function public.avisar_reclamo_nuevo() from public;

drop trigger if exists complaints_avisar on public.complaints;
create trigger complaints_avisar
  after insert on public.complaints
  for each row execute function public.avisar_reclamo_nuevo();

comment on function public.avisar_reclamo_nuevo() is
  'B-08: al registrarse un reclamo, avisa por la campana a Admin y Superadmin. '
  'El aviso lleva código, nombre y clase porque no hay pantalla del Libro (B-09) '
  'a la que enlazar. Nunca aborta el INSERT: el registro del reclamo manda.';
