-- =====================================================================
-- 0001_enums.sql — Tipos enumerados del dominio eFFe Multiclasificados
-- =====================================================================

create type public.app_role          as enum ('anunciante', 'buscador', 'admin', 'superadmin');
create type public.listing_status    as enum ('draft', 'pending', 'active', 'paused', 'expired', 'rejected', 'sold');
create type public.currency          as enum ('PEN', 'USD');
create type public.listing_condition as enum ('nuevo', 'usado', 'na');
create type public.order_status      as enum ('pending', 'paid', 'failed', 'refunded');
create type public.invoice_type      as enum ('boleta', 'factura');
create type public.report_status     as enum ('open', 'reviewing', 'resolved');
create type public.application_status as enum ('pending', 'reviewed', 'accepted', 'rejected');
create type public.doc_type          as enum ('dni', 'ruc', 'ce');
