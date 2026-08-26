-- =====================================================================
-- 0125_reintentar_empieza_de_cero.sql
--
-- El botón "Reintentar" de un comprobante daba UN solo intento, no ocho.
--
-- La emisión automática se rinde a los 8 intentos y marca el comprobante como
-- `vencido` (migración 0083). El reintento manual devolvía el estado a
-- `pendiente` pero **no tocaba el contador**, así que un comprobante que ya
-- llevaba 8 volvía a la cola con 8: al primer fallo cruzaba otra vez el umbral
-- y regresaba a `vencido`. El administrador pulsaba un botón que prometía
-- reintentar y obtenía un único disparo.
--
-- Peor aún cuando el problema de fondo ya estaba resuelto —el caso normal, que
-- es para lo que existe ese botón: se da de alta el RUC en Factiliza, se pulsa
-- Reintentar, falla el primero por lo que sea y el comprobante se da por
-- perdido sin haber usado su margen.
--
-- Y el contador seguía creciendo sin techo: en producción había comprobantes
-- con 57 y 60 intentos acumulados de pulsaciones sucesivas. Un número así no
-- dice nada útil; solo esconde que cada tanda fue de uno.
--
-- Reintentar a mano es una decisión humana y explícita: empieza de cero.
--
-- Idempotente.
-- =====================================================================

create or replace function public.retry_invoice_emission(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_perm('Pagos y planes', 'edit') then
    raise exception 'no autorizado';
  end if;

  update public.invoices
     set sunat_status      = case
             when sunat_status in ('rechazado','error','omitido','enviando','vencido')
               and public.invoice_emission_enabled() then 'pendiente'
             else sunat_status end,
         -- El margen se reinicia SOLO si de verdad vuelve a la cola. Si el
         -- comprobante ya estaba aceptado, esta llamada no debe borrarle su
         -- historial de intentos.
         sunat_attempts    = case
             when sunat_status in ('rechazado','error','omitido','enviando','vencido')
               and public.invoice_emission_enabled() then 0
             else sunat_attempts end,
         sunat_next_try_at = now(),
         sunat_claim_id    = null,
         needs_review      = false,
         email_status      = case when email_status in ('error','omitido')
                                  then 'pendiente' else email_status end,
         email_attempts    = case when email_status in ('error','omitido')
                                  then 0 else email_attempts end,
         email_next_try_at = now(),
         email_claim_id    = null
   where id = p_invoice_id;

  perform public.dispatch_invoice_emission(p_invoice_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- `create or replace` conserva los permisos, pero se repiten por si algún día
-- alguien la recrea con DROP + CREATE: ahí sí se pierden, y el síntoma sería un
-- 42501 silencioso desde el panel.
revoke execute on function public.retry_invoice_emission(uuid) from public;
grant  execute on function public.retry_invoice_emission(uuid) to authenticated, service_role;

comment on function public.retry_invoice_emission(uuid) is
  'Devuelve un comprobante a la cola de emisión y de correo, reiniciando su '
  'contador de intentos: reintentar a mano es una decisión humana y empieza de '
  'cero. Sin el reinicio daba un solo intento en vez de los ocho.';
