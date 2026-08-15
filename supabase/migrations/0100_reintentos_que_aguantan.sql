-- =====================================================================
-- 0100_reintentos_que_aguantan.sql
--
-- Que un comprobante se emita SOLO, sin que nadie tenga que mirarlo.
--
-- El problema, medido
-- -------------------
-- Aquí todos los comprobantes salen de una compra: mismos datos, mismo
-- formato, generados por el mismo código. Un rechazo por datos malos es
-- rarísimo. Lo que sí pasa —y ya pasó— es que Factiliza o SUNAT fallen un
-- rato. Para eso está el reintento… salvo que el presupuesto se agotaba
-- antes de tiempo:
--
--   · el backoff era 3^n minutos con tope de 1 hora, y se cortaba a los 8
--     intentos: 1+3+9+27+60+60+60+60 ≈ **menos de 5 horas**;
--   · pasadas esas 5 horas el comprobante se marcaba 'vencido' aunque el
--     plazo real de SUNAT sea de 3 DÍAS;
--   · y lo peor: **esperar gastaba un intento**. Cuando Factiliza contesta
--     «este documento aún se encuentra pendiente de envío» no ha fallado
--     nada, pero cada consulta quemaba uno de los ocho.
--
-- O sea: una cola lenta de su lado bastaba para dar por muerto un
-- comprobante que iba a emitirse solo.
--
-- Qué cambia
-- ----------
--   1. Esperar ya no cuenta. Si la respuesta es «sigue en cola», se
--      devuelve el intento y se vuelve en 5 minutos.
--   2. El corte lo pone el PLAZO (3 días), no un contador. El límite de
--      intentos sube a 60, que con tope de 1 hora cubre esos días de sobra
--      sin dejar de ser un tope.
--
-- Con esto, el único caso que sigue necesitando una persona es el rechazo
-- por datos —código numérico de SUNAT—, que es el que de verdad no se
-- arregla reintentando.
--
-- Idempotente.
-- =====================================================================

create or replace function public.finish_invoice_emission(
  p_invoice_id    uuid,
  p_claim_id      uuid,
  p_status        public.invoice_sunat_status,
  p_hash          text default null,
  p_cdr           jsonb default null,
  p_cdr_zip       text default null,
  p_error_code    text default null,
  p_error_message text default null,
  p_needs_review  boolean default false,
  -- NUEVO: la respuesta fue «sigue en cola», no un fallo.
  p_espera        boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
  -- Tope de seguridad, no el corte real: con la espera máxima de 1 hora,
  -- 60 intentos son más de los que caben en el plazo de 3 días. Quien corta
  -- de verdad es `expire_stale_invoices`, que mira la FECHA.
  v_max_intentos constant int := 60;
begin
  update public.invoices i
     set sunat_status      = case
                               when p_status = 'error' and not p_espera
                                    and i.sunat_attempts >= v_max_intentos then 'vencido'
                               else p_status
                             end,
         -- Esperar no gasta presupuesto: se devuelve el intento que sumó la
         -- reserva. Si no, una cola lenta de Factiliza agotaría los reintentos
         -- sin que hubiera fallado nada.
         sunat_attempts    = case when p_espera then greatest(0, i.sunat_attempts - 1)
                                  else i.sunat_attempts end,
         sunat_hash        = coalesce(p_hash, i.sunat_hash),
         sunat_cdr         = coalesce(p_cdr, i.sunat_cdr),
         sunat_cdr_zip     = coalesce(p_cdr_zip, i.sunat_cdr_zip),
         sunat_error_code  = p_error_code,
         sunat_last_error  = p_error_message,
         -- Un documento que solo está esperando NO va a revisión: nadie tiene
         -- que hacer nada con él.
         needs_review      = case when p_espera then false else p_needs_review end,
         sunat_sent_at     = case when p_status in ('aceptado','observado')
                                  then now() else i.sunat_sent_at end,
         sunat_claim_id    = null,
         sunat_next_try_at = case
             -- En cola: se vuelve pronto y a ritmo constante. Su mensaje dice
             -- «espere unos minutos», así que se le hace caso.
             when p_espera then now() + interval '5 minutes'
             when p_status = 'error' and i.sunat_attempts < v_max_intentos
               then now() + least(interval '1 hour',
                                  make_interval(mins => (power(3, least(i.sunat_attempts, 5)))::int))
             else null
           end
   where i.id = p_invoice_id
     and i.sunat_claim_id = p_claim_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke execute on function public.finish_invoice_emission(
  uuid, uuid, public.invoice_sunat_status, text, jsonb, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_invoice_emission(
  uuid, uuid, public.invoice_sunat_status, text, jsonb, text, text, text, boolean, boolean)
  to service_role;
