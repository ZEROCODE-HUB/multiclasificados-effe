-- =====================================================================
-- 0136_documento_de_quien_reporta.sql — punto B-10 de la auditoría
--
-- «Los avisos que son Reportados, además de validar el MOTIVO y colocar un
--  comentario, solicitar el DNI de quién lo reporta y validarlo. Antes de pulsar
--  el botón Enviar Reporte. Se debe controlar la cantidad de Reportes que tiene
--  un aviso (…) y por lo tanto tener un reporte de quienes hicieron Reporte de
--  Avisos, con los campos DNI, Apellidos y nombres, fecha y hora del reporte,
--  motivo, comentarios. (qué acciones realizó EFFE ante ese reporte: en
--  revisión, cerrado, anulado, otros)»
--
-- CUATRO PIEZAS
--
--  1. Las columnas del documento en `reports`.
--  2. `admin_list_reports()` rehecha para devolverlas, más la CUENTA de
--     reportes que acumula cada aviso.
--  3. Un freno: pedir el documento hace que cada reporte cueste una consulta a
--     Factiliza, que se paga. Sin tope, denunciar en bucle es gastar nuestro
--     dinero.
--  4. Los estados de un reporte, que ya existían, quedan documentados abajo.
--
-- ⚠️ EL DETALLE QUE ROMPE PRODUCCIÓN SI SE OLVIDA
--
-- `admin_list_reports()` cambia de tipo de retorno, así que hay que DROP y
-- CREATE. `create or replace` conserva los permisos; **DROP + CREATE los
-- pierde**, y desde la 0104 una función nace sin EXECUTE para `authenticated`.
-- Si no se vuelve a conceder aquí abajo, el panel de denuncias sale vacío en
-- producción con un 42501 silencioso. Ya pasó una vez y dejó el buscador a cero.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Quién reporta ----------
alter table public.reports
  add column if not exists reporter_name       text,
  add column if not exists reporter_doc_type   text,
  add column if not exists reporter_doc_number text,
  -- Tres estados, no dos. `false` no es lo mismo que `null`:
  --   true  → se comprobó y el documento existe.
  --   false → se comprobó y NO existe (no debería llegar: el front lo corta).
  --   null  → no se pudo comprobar (Factiliza caída o sin cuota).
  -- Quien modera necesita distinguirlos: un reporte sin verificar no es un
  -- reporte con documento falso.
  add column if not exists reporter_doc_verified boolean;

create index if not exists reports_reporter_doc_idx
  on public.reports (reporter_doc_number);

comment on column public.reports.reporter_doc_verified is
  'true = documento comprobado y existe; false = comprobado y no existe; '
  'null = no se pudo comprobar (servicio caído). Null y false NO son lo mismo.';

-- ---------- 2. El listado del panel, con documento y cuenta ----------
drop function if exists public.admin_list_reports();
create function public.admin_list_reports()
returns table(
  id uuid, target_type text, reason text, category text, status text, action_taken text,
  reporter text, reported text, reporter_id uuid, reported_id uuid,
  listing_id uuid, listing_title text, assigned_to uuid, assignee text, created_at timestamptz,
  -- Lo que añade B-10:
  reporter_name text, reporter_doc_type text, reporter_doc_number text,
  reporter_doc_verified boolean,
  -- Cuántos reportes acumula ESE aviso, contando este. Es "controlar la
  -- cantidad de Reportes que tiene un aviso": un aviso con nueve denuncias no
  -- se lee igual que uno con una, y en una lista ordenada por fecha eso no se
  -- ve. Va calculado aquí y no en el front porque el front solo tiene la página
  -- que está mirando.
  reportes_del_aviso bigint
)
language sql security definer set search_path to 'public' as $$
  select
    r.id, r.target_type::text, r.reason, r.category, r.status::text, r.action_taken,
    rep.full_name as reporter,
    coalesce(tu.full_name, lo.full_name) as reported,
    r.reported_by as reporter_id,
    coalesce(r.target_user_id, lo.id) as reported_id,
    r.listing_id, l.title as listing_title,
    r.assigned_to, asg.full_name as assignee,
    r.created_at,
    -- El nombre del formulario manda sobre el del perfil: es el que se comprobó
    -- contra el documento. El del perfil lo escribe cada uno y puede ser un alias.
    coalesce(nullif(btrim(r.reporter_name), ''), rep.full_name) as reporter_name,
    r.reporter_doc_type,
    r.reporter_doc_number,
    r.reporter_doc_verified,
    case
      when r.listing_id is null then null
      else (select count(*) from public.reports r2 where r2.listing_id = r.listing_id)
    end as reportes_del_aviso
  from public.reports r
  left join public.profiles rep on rep.id = r.reported_by
  left join public.profiles tu  on tu.id  = r.target_user_id
  left join public.listings  l  on l.id   = r.listing_id
  left join public.profiles lo  on lo.id  = l.owner_id
  left join public.profiles asg on asg.id = r.assigned_to
  where public.is_staff(auth.uid())
  order by
    case r.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    r.created_at desc;
$$;

-- ⚠️ Estas dos líneas son las que evitan el 42501 descrito arriba. No borrar.
revoke execute on function public.admin_list_reports() from public;
grant  execute on function public.admin_list_reports() to authenticated;

-- ---------- 3. El freno ----------
-- Cada reporte lleva ahora una verificación de documento, y cada verificación
-- se paga. Sin tope, denunciar en bucle es gastar nuestro saldo de Factiliza:
-- el abuso deja de ser una molestia y pasa a tener factura.
--
-- Cinco por hora y quince por día. Quien denuncia de buena fe no llega ni de
-- lejos; hay que estar buscándolo. Configurable en `system_settings`
-- (`limites_de_tasa`) igual que los de la 0124, y un tope en 0 lo desactiva.
create or replace function public.frenar_reportes_en_rafaga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hora int;
  v_dia  int;
  v_n    int;
begin
  -- El personal queda exento, como en la 0124: un moderador revisando no es el
  -- abuso que esto persigue.
  if new.reported_by is null or public.is_staff(new.reported_by) then
    return new;
  end if;

  v_hora := public.tope_de_tasa('reporte', 'hora', 5);
  if v_hora > 0 then
    select count(*) into v_n
      from public.reports
     where reported_by = new.reported_by
       and created_at > now() - interval '1 hour';
    if v_n >= v_hora then
      raise exception
        using errcode = 'P0001',
              hint    = 'limite_de_tasa',
              message = 'Has enviado varios reportes en poco tiempo. '
                     || 'Espera unos minutos y vuelve a intentarlo.';
    end if;
  end if;

  v_dia := public.tope_de_tasa('reporte', 'dia', 15);
  if v_dia > 0 then
    select count(*) into v_n
      from public.reports
     where reported_by = new.reported_by
       and created_at > now() - interval '1 day';
    if v_n >= v_dia then
      raise exception
        using errcode = 'P0001',
              hint    = 'limite_de_tasa',
              message = 'Has alcanzado el máximo de reportes por día. '
                     || 'Si necesitas denunciar algo más, escríbenos.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.frenar_reportes_en_rafaga() from public;

drop trigger if exists reports_limite_de_tasa on public.reports;
create trigger reports_limite_de_tasa
  before insert on public.reports
  for each row execute function public.frenar_reportes_en_rafaga();

comment on function public.frenar_reportes_en_rafaga() is
  'B-10: tope de reportes por usuario (5/hora, 15/día). Existe porque desde la '
  '0136 cada reporte cuesta una verificación de documento, que se paga. El '
  'personal queda exento. Topes en system_settings.limites_de_tasa; 0 = sin límite.';
