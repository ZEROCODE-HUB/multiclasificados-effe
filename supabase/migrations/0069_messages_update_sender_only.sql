-- =====================================================================
-- EFFE-030 (CRÍTICO): solo el emisor (o staff) puede EDITAR un mensaje.
--
-- La policy anterior `messages_update_participant` solo exigía ser
-- buyer/seller de la conversación, sin `sender_id = auth.uid()`. Eso permitía
-- que cualquier participante reescribiera el body de un mensaje que no envió
-- (verificado en vivo). Se corrige exigiendo ser el emisor, y se le da a
-- is_staff() la capacidad de corregir/revertir mensajes.
--
-- Ojo (regresión): `mark_messages_delivered` y `mark_messages_read` marcan como
-- recibidos/leídos los mensajes del OTRO participante (sender_id <> auth.uid()).
-- Corrían como SECURITY INVOKER y dependían de la policy laxa; con la policy
-- restringida ya no podrían. Se pasan a SECURITY DEFINER: su propio WHERE ya
-- acota a las conversaciones del llamante (auth.uid() sigue siendo el usuario
-- real dentro de una función definer), así que el cambio es seguro y no amplía
-- lo que tocan.
-- =====================================================================

drop policy if exists "messages_update_participant" on public.messages;
create policy "messages_update_participant" on public.messages for update
  using (sender_id = auth.uid() or public.is_staff(auth.uid()))
  with check (sender_id = auth.uid() or public.is_staff(auth.uid()));

create or replace function public.mark_messages_delivered(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
  set status = 'delivered', delivered_at = coalesce(delivered_at, now())
  where conversation_id = p_conversation
    and sender_id <> auth.uid()
    and status = 'sent'
    and exists (select 1 from public.conversations c
                where c.id = p_conversation and (c.buyer_id = auth.uid() or c.seller_id = auth.uid()));
end;
$$;

create or replace function public.mark_messages_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.messages
  set status = 'read', read_at = coalesce(read_at, now()), delivered_at = coalesce(delivered_at, now())
  where conversation_id = p_conversation
    and sender_id <> auth.uid()
    and read_at is null
    and exists (select 1 from public.conversations c
                where c.id = p_conversation and (c.buyer_id = auth.uid() or c.seller_id = auth.uid()));
end;
$$;
