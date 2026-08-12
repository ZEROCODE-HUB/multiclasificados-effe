-- =====================================================================
-- Endurecimiento de settle_paid_order (hueco crítico hallado 2026-08-12).
--
-- La 0071 revocó add_credits() de PUBLIC/anon/authenticated, pero se saltó a la
-- función hermana: settle_paid_order() es SECURITY DEFINER, su único guard es
-- `status <> 'paid'` y NUNCA se le revocó el EXECUTE por defecto de PUBLIC que
-- Postgres otorga al crear una función. El `grant ... to service_role` de la
-- 0061/0083 es redundante y no restringe nada.
--
-- Comprobado contra producción con la sola anon key (la que va en el bundle
-- público), sin ninguna sesión:
--   POST /rest/v1/rpc/settle_paid_order → HTTP 200 {"settled": false}
-- Devolvió false solo porque el UUID de la sonda no existe. Con el id de una
-- orden real en estado 'pending' habría devuelto true: marca la orden como
-- pagada, acredita los créditos vía add_credits (que corre con privilegios del
-- owner, así que el revoke de la 0071 no la protege por esta vía) y además
-- inserta en invoices con sunat_status='pendiente', disparando un comprobante
-- electrónico a SUNAT por un pago que nunca ocurrió.
--
-- El bypass no requería nada sofisticado: el comprador recibe su propio orderId
-- de create-payment (lo usa el polling), así que bastaba iniciar la compra,
-- cerrar el formulario sin pagar y llamar al RPC.
--
-- La ÚNICA vía legítima sigue siendo el webhook payment-webhook, que valida la
-- firma HMAC del IPN y entra con la service_role key.
-- =====================================================================

revoke execute on function public.settle_paid_order(uuid, text) from public;
revoke execute on function public.settle_paid_order(uuid, text) from anon;
revoke execute on function public.settle_paid_order(uuid, text) from authenticated;

-- Se mantiene explícito el único rol que debe poder llamarla.
grant execute on function public.settle_paid_order(uuid, text) to service_role;

-- Nota para futuras migraciones que hagan `create or replace` de esta función:
-- REPLACE conserva los permisos actuales, así que el revoke de arriba sobrevive.
-- Pero si alguien la borra y la vuelve a crear (drop + create), el default de
-- PUBLIC vuelve a aplicarse y hay que repetir estos revokes.
