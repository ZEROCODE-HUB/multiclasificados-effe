-- =====================================================================
-- 0035_profile_company.sql — Datos de empresa editables en el perfil.
-- Separados de doc_type/doc_number (que usa la verificación con Factiliza),
-- para que el anunciante pueda guardar su razón social y RUC de facturación.
-- (idempotente)
-- =====================================================================

alter table public.profiles add column if not exists company_name text;
alter table public.profiles add column if not exists company_ruc  text;
