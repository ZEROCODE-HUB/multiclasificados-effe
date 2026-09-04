-- Se queda UNA sola `next_invoice_number`: la de dos argumentos.
--
-- ── QUÉ PASABA ───────────────────────────────────────────────────────────────
--
-- Convivían dos versiones. La vieja, de un argumento, reparte SIEMPRE serie de
-- producción (B001/F001) porque es anterior a que existieran las series de
-- prueba. La nueva añadió `p_pruebas boolean DEFAULT false`.
--
-- Y ahí está la trampa: con la de un argumento todavía viva, una llamada como
--
--     select * from next_invoice_number('boleta');
--
-- encaja en las DOS (en la nueva por el DEFAULT), así que Postgres se niega:
--
--     ERROR 42725: function next_invoice_number(invoice_type) is not unique
--
-- Hoy nadie la llama así —`set_invoice_number` pasa siempre los dos argumentos,
-- y por eso resuelve sin ambigüedad— pero el día que alguien la llame a mano
-- desde el SQL editor, o que una migración futura la copie mal, se encuentra un
-- error que no dice nada de series ni de correlativos.
--
-- ── POR QUÉ IMPORTA MÁS DE LO QUE PARECE ─────────────────────────────────────
--
-- La versión vieja no es solo redundante: es PELIGROSA. Reparte correlativo de
-- la serie fiscal real sin preguntar si el comprobante es de prueba. Es la misma
-- familia de fallo que la 0119, donde perder el `es_prueba` hizo que una boleta
-- de pruebas se llevara un B001 y SUNAT la rechazara — quemando un correlativo
-- real que ya no se recupera.
--
-- Con la app en producción desde el 2026-09-04 esto deja de ser hipotético.

drop function if exists public.next_invoice_number(public.invoice_type);

-- La que se queda nace cerrada por la 0104, así que se repiten los permisos que
-- ya tenía: solo el dueño de la transacción la usa, a través del disparador
-- `set_invoice_number`, que es SECURITY DEFINER. Nadie la llama desde el cliente.
revoke all on function public.next_invoice_number(public.invoice_type, boolean) from public;
