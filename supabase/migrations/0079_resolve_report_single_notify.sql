-- =====================================================================
-- 0079_resolve_report_single_notify.sql — Una sola notificación al deshabilitar
--
-- Desde IT3-020, el panel deshabilita el aviso denunciado con
-- `admin_set_listing_status` (que exige 'Gestión de avisos' · Editar) y acto
-- seguido cierra la denuncia con `admin_resolve_report(..., 'remove', ...)`.
-- Ambas funciones notificaban 'listing_disabled', así que el anunciante recibía
-- el mismo aviso DOS veces.
--
-- Aquí la rama 'remove' pasa a ser idempotente: si el aviso ya está rechazado,
-- no lo vuelve a tocar ni vuelve a notificar. La denuncia se cierra igual.
-- Resto del comportamiento idéntico a 0038.
-- =====================================================================

create or replace function public.admin_resolve_report(p_report uuid, p_action text, p_note text default null)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_report public.reports%rowtype;
  v_owner  uuid;
  v_title  text;
  v_status text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'no autorizado';
  end if;
  if p_action not in ('dismiss', 'warn', 'remove', 'ban') then
    raise exception 'acción inválida: %', p_action;
  end if;

  select * into v_report from public.reports where id = p_report;
  if not found then raise exception 'denuncia no encontrada'; end if;

  -- Usuario afectado: el reportado, o el dueño del aviso reportado.
  v_owner := coalesce(
    v_report.target_user_id,
    (select owner_id from public.listings where id = v_report.listing_id)
  );

  -- Efecto colateral + notificación según la acción.
  if p_action = 'remove' and v_report.listing_id is not null then
    select status, title into v_status, v_title
      from public.listings where id = v_report.listing_id;
    -- Ya deshabilitado (p. ej. por el botón del panel, que notifica por su
    -- cuenta): cerrar la denuncia sin repetir el aviso al anunciante.
    if v_status is distinct from 'rejected' then
      update public.listings
        set status = 'rejected', rejection_reason = coalesce(p_note, 'Removido por moderación')
        where id = v_report.listing_id;
      perform public.notify_user(
        v_owner, 'listing_disabled', 'Aviso deshabilitado',
        jsonb_build_object('listing_title', v_title, 'reason', coalesce(p_note, v_report.reason), 'report_id', p_report)
      );
    end if;
  elsif p_action = 'ban' then
    if v_owner is not null then
      update public.profiles
        set status = 'suspended', ban_reason = coalesce(p_note, v_report.reason)
        where id = v_owner;
      perform public.notify_user(
        v_owner, 'account_suspended', 'Tu cuenta fue suspendida',
        jsonb_build_object('reason', coalesce(p_note, v_report.reason), 'report_id', p_report)
      );
    end if;
  elsif p_action = 'warn' then
    perform public.notify_user(
      v_owner, 'moderation_warning', 'Advertencia de moderación',
      jsonb_build_object('reason', v_report.reason, 'note', p_note, 'report_id', p_report)
    );
  end if;

  update public.reports
    set status = 'resolved', action_taken = p_action, resolution_note = p_note,
        resolved_by = auth.uid(), resolved_at = now()
    where id = p_report;

  perform public.log_audit('resolve_report', 'report', p_report::text,
                           jsonb_build_object('action', p_action, 'note', p_note));
end;
$function$;
