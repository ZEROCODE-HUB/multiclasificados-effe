-- =====================================================================
-- 0105_acuse_del_libro_de_reclamaciones.sql
--
-- El Reglamento del Libro de Reclamaciones obliga a remitir al consumidor,
-- cuando deja su correo, copia de la hoja que acaba de ingresar y constancia
-- de la fecha y hora del registro. La Edge Function `send-reclamo` ya lo hace;
-- lo que faltaba era dónde anotar que se hizo.
--
-- Guardar el resultado en la propia fila y no solo en los registros de Resend
-- es la parte que importa: si mañana hay que demostrar que el acuse salió, la
-- prueba tiene que estar en el Libro, que es el documento legal, y no en un
-- panel de un tercero del que además se puede perder el acceso.
--
-- `created_at` ya existía y es el que da fe de la hora de presentación: lo pone
-- la base de datos (`default now()`), no el navegador de quien reclama.
-- =====================================================================

alter table public.complaints
  add column if not exists ack_email_status     text        not null default 'pendiente',
  add column if not exists ack_email_sent_at    timestamptz,
  add column if not exists ack_email_message_id text,
  add column if not exists ack_email_error      text;

-- 'pendiente' es el estado de las hojas anteriores a este cambio (a esas nunca
-- se les envió copia) y el de un envío que aún no se ha intentado.
do $$
begin
  alter table public.complaints
    add constraint complaints_ack_email_status_check
    check (ack_email_status in ('pendiente', 'enviado', 'error'));
exception
  when duplicate_object then null;
end $$;

comment on column public.complaints.ack_email_status is
  'Acuse de recibo al consumidor: pendiente | enviado | error. Obligatorio por el Reglamento del Libro de Reclamaciones.';
comment on column public.complaints.ack_email_sent_at is
  'Momento en que Resend aceptó el acuse. La fecha de PRESENTACIÓN del reclamo es created_at.';

-- Para encontrar de un vistazo las hojas cuyo acuse falló.
create index if not exists complaints_ack_pendiente_idx
  on public.complaints (created_at desc)
  where ack_email_status <> 'enviado';
