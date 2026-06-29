-- =====================================================================
-- 0012_messaging.sql — REQ-05: estados de mensaje (Enviado/Recibido/Leído)
-- y sincronización de la conversación (idempotente)
-- =====================================================================

alter table public.messages add column if not exists status public.message_status not null default 'sent';
alter table public.messages add column if not exists delivered_at timestamptz;

-- Al insertar un mensaje, actualiza el resumen de la conversación.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set last_message = new.body, last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conv on public.messages;
create trigger messages_touch_conv
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- Marca como "recibido" (delivered) los mensajes del otro al entrar a la conversación.
create or replace function public.mark_messages_delivered(p_conversation uuid)
returns void
language plpgsql
security invoker
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

-- Marca como "leído" los mensajes del otro participante.
create or replace function public.mark_messages_read(p_conversation uuid)
returns void
language plpgsql
security invoker
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
