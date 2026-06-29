-- =====================================================================
-- 0019_invoice_owner_insert.sql — Permite que el dueño de la orden genere
-- su comprobante (no solo staff). (idempotente)
-- =====================================================================

drop policy if exists "invoices_insert_staff" on public.invoices;
drop policy if exists "invoices_insert_owner_or_staff" on public.invoices;
create policy "invoices_insert_owner_or_staff" on public.invoices for insert
  with check (
    public.is_staff(auth.uid())
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );
