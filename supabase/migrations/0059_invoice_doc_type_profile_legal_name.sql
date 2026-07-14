-- =====================================================================
-- 0059_invoice_doc_type_profile_legal_name.sql
-- Guarda los datos de Factiliza en el comprobante y el perfil:
--   * invoices.doc_type  → tipo de documento del comprobante (Usuario=DNI/CE,
--     Empresa=RUC). Ya guardábamos advertiser_name y doc_number; faltaba el tipo.
--   * profiles.legal_name → nombre/razón social verificado por Factiliza, para
--     reusarlo al publicar SIN volver a pedir la verificación en un modal.
-- (idempotente)
-- =====================================================================

alter table public.invoices
  add column if not exists doc_type public.doc_type;

alter table public.profiles
  add column if not exists legal_name text;
