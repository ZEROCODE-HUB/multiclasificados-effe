-- =====================================================================
-- EFFE-039: notificar al DUEÑO del aviso cuando llega una postulación NUEVA.
--
-- Hasta ahora solo existía `applications_notify` (AFTER UPDATE): notifica al
-- postulante cuando cambia el estado de su postulación. No había nada para el
-- dueño del aviso de empleo al recibir una postulación nueva.
--
-- Se agrega un trigger AFTER INSERT que le notifica. notify_user() ya respeta
-- las preferencias del usuario y omite si el destinatario es null.
-- =====================================================================

create or replace function public.on_new_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_title text;
begin
  select l.owner_id, l.title into v_owner, v_title
  from public.listings l where l.id = new.listing_id;

  perform public.notify_user(
    v_owner, 'new_application', 'Nueva postulación',
    jsonb_build_object('listing_id', new.listing_id, 'listing_title', v_title, 'application_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists applications_notify_insert on public.job_applications;
create trigger applications_notify_insert
  after insert on public.job_applications
  for each row execute function public.on_new_application();
