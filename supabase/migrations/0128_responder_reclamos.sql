-- =====================================================================
-- 0128_responder_reclamos.sql — punto B-09 de la auditoría
--
-- Los reclamos se guardaban y el consumidor recibía su acuse con la hoja en PDF,
-- pero para atenderlos había que entrar a la base de datos: no había pantalla,
-- ni forma de responder, ni rastro de qué se contestó.
--
-- Esto añade lo que falta del lado de los datos: la respuesta, quién la dio y
-- cuándo. La pantalla y el correo van aparte.
--
-- POR QUÉ LA RESPUESTA SE GUARDA Y NO SOLO SE MANDA
--
-- El Reglamento del Libro de Reclamaciones obliga a responder en treinta días
-- **y a poder acreditarlo**. Un correo enviado desde la bandeja de alguien no
-- es un registro: si esa persona se va, o borra el hilo, la constancia se va con
-- ella. Guardada aquí, la respuesta forma parte del expediente del reclamo, que
-- es lo que se enseña si Indecopi pregunta.
--
-- Idempotente.
-- =====================================================================

alter table public.complaints
  add column if not exists respuesta       text,
  add column if not exists respondida_at   timestamptz,
  add column if not exists respondida_por  uuid references auth.users(id) on delete set null,
  -- Si el correo de respuesta salió o no. Se guarda aparte del texto: la
  -- respuesta existe aunque el envío falle, y hay que poder reintentarlo sin
  -- volver a escribirla.
  add column if not exists respuesta_email_status text,
  add column if not exists respuesta_email_error  text;

comment on column public.complaints.respuesta is
  'Texto de la respuesta al consumidor. Se guarda además de enviarse porque el '
  'Reglamento obliga a poder ACREDITAR la respuesta, y un correo en la bandeja '
  'de alguien no es un registro.';

-- Índice para el listado: se ordena y se filtra por fecha casi siempre.
create index if not exists complaints_created_idx on public.complaints (created_at desc);

/**
 * Guarda la respuesta a un reclamo y lo marca como resuelto.
 *
 * El envío del correo NO va aquí: lo hace la Edge Function, que es quien tiene
 * las credenciales de Resend. Si el correo falla, la respuesta ya está guardada
 * y se puede reintentar — al revés (mandar sin guardar) dejaría un consumidor
 * respondido y un expediente vacío.
 */
create or replace function public.responder_reclamo(
  p_id        uuid,
  p_respuesta text,
  p_estado    text default 'resuelto'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila public.complaints;
begin
  if not public.has_perm('Gestión de avisos', 'edit') and not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  if p_respuesta is null or btrim(p_respuesta) = '' then
    raise exception 'La respuesta no puede estar vacía';
  end if;
  if p_estado not in ('pendiente', 'en_proceso', 'resuelto') then
    raise exception 'Estado no válido: %', p_estado;
  end if;

  update public.complaints
     set respuesta      = btrim(p_respuesta),
         respondida_at  = now(),
         respondida_por = auth.uid(),
         status         = p_estado
   where id = p_id
  returning * into v_fila;

  if v_fila.id is null then
    raise exception 'Reclamo no encontrado';
  end if;

  perform public.log_audit('answer_complaint', 'complaint', p_id::text,
    jsonb_build_object('estado', p_estado));

  -- Se devuelven los datos que necesita quien manda el correo, para no tener
  -- que consultar otra vez.
  return jsonb_build_object(
    'ok', true,
    'email', v_fila.email,
    'full_name', v_fila.full_name,
    'code', v_fila.code,
    'kind', v_fila.kind
  );
end;
$$;

revoke execute on function public.responder_reclamo(uuid, text, text) from public;
grant  execute on function public.responder_reclamo(uuid, text, text) to authenticated;

comment on function public.responder_reclamo(uuid, text, text) is
  'B-09: guarda la respuesta a un reclamo, la fecha y quién la dio, y devuelve '
  'los datos del consumidor para enviarle el correo. El envío va aparte a '
  'propósito: si falla, la respuesta ya está registrada.';

/** Marca si el correo de respuesta salió, para poder reintentarlo. */
create or replace function public.marcar_envio_respuesta(
  p_id     uuid,
  p_estado text,
  p_error  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  update public.complaints
     set respuesta_email_status = p_estado,
         respuesta_email_error  = p_error
   where id = p_id;
end;
$$;

revoke execute on function public.marcar_envio_respuesta(uuid, text, text) from public;
grant  execute on function public.marcar_envio_respuesta(uuid, text, text) to authenticated, service_role;
