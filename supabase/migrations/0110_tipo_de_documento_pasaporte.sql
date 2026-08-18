-- =====================================================================
-- 0110_tipo_de_documento_pasaporte.sql — el pasaporte entra en el catálogo de
-- documentos.
--
-- Un extranjero de paso no tiene DNI ni carné de extranjería, así que hasta hoy
-- no podía comprar saldo: la app exige verificar un documento contra Factiliza
-- y el enum solo admitía 'dni', 'ruc' y 'ce'. SUNAT sí contempla el pasaporte
-- (catálogo 06, tipo 7); lo único que faltaba era admitirlo aquí.
--
-- VA SOLA EN SU ARCHIVO A PROPÓSITO: PostgreSQL no deja usar un valor de enum
-- en la misma transacción en la que se añade, y cada archivo de migración corre
-- en una transacción. Si esto estuviera junto a la 0111, la propia 0111 fallaría
-- al intentar usar 'pasaporte'.
--
-- Idempotente: `if not exists`.
-- =====================================================================

alter type public.doc_type add value if not exists 'pasaporte';
