-- =====================================================================
-- 0106_menos_consultas_a_factiliza.sql
--
-- Cada verificación de DNI/RUC es una consulta que se le paga a Factiliza, y
-- hasta ahora no había ningún tope: bastaba con tener sesión para consultar
-- documentos uno tras otro. Dos agujeros en el mismo sitio —el dinero y la
-- privacidad de terceros—, porque la respuesta de RENIEC trae nombre y
-- domicilio de cualquier DNI que se escriba.
--
-- Esta tabla es a la vez el registro de consultas (para el tope) y la caché
-- (para no volver a pagar por lo mismo). Escribir el mismo documento otra vez
-- —al corregir un dígito, al volver a comprar la semana siguiente— ya no gasta.
--
-- Se guardan también las consultas FALLIDAS: quien va probando documentos que
-- no existen es justamente a quien hay que frenar, y si no contaran, el tope
-- no serviría de nada.
--
-- Nadie lee esta tabla desde el cliente: la RLS queda activada y sin políticas,
-- así que solo la Edge Function `verify-doc` (service_role) la toca.
-- =====================================================================

create table if not exists public.doc_lookups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  doc_type    text not null check (doc_type in ('dni', 'ruc')),
  doc_number  text not null,
  -- Si Factiliza encontró el documento. Las fallidas también cuentan para el tope.
  ok          boolean not null,
  -- Resultado, para responder sin volver a consultar. Solo dentro de la ventana
  -- de caché; pasada esa, la fila queda únicamente como registro del tope.
  nombre      text,
  data        jsonb,
  created_at  timestamptz not null default now()
);

-- Para contar lo que lleva consultado un usuario en la última hora / el día.
create index if not exists doc_lookups_user_idx
  on public.doc_lookups (user_id, created_at desc);

-- Para encontrar la última consulta buena de ESE usuario sobre ESE documento.
create index if not exists doc_lookups_cache_idx
  on public.doc_lookups (user_id, doc_type, doc_number, created_at desc)
  where ok;

alter table public.doc_lookups enable row level security;
-- Sin políticas a propósito: contiene datos personales de terceros (nombre y
-- domicilio de cualquier DNI consultado) y nadie tiene por qué leerlos desde el
-- navegador. `service_role` no pasa por RLS.

comment on table public.doc_lookups is
  'Consultas de DNI/RUC a Factiliza: sirve de tope por usuario y de caché. Solo service_role.';

-- Purga de lo viejo. Se llama desde donde se llame a las demás tareas de
-- mantenimiento; no hay cron para esto. Borra el detalle personal en cuanto
-- deja de valer como caché, y la fila entera cuando ya no puede influir en
-- ningún tope (los topes miran como mucho un día atrás).
create or replace function public.purge_doc_lookups(p_dias int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas int;
begin
  -- Primero, olvidar los datos personales de las consultas que ya no se cachean.
  update public.doc_lookups
     set nombre = null, data = null
   where created_at < now() - make_interval(days => greatest(p_dias, 1))
     and (nombre is not null or data is not null);

  -- Y tirar las filas que ya no sirven ni para el tope.
  delete from public.doc_lookups
   where created_at < now() - make_interval(days => greatest(p_dias, 1) + 30);
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

-- Que no la pueda llamar cualquiera: por defecto Postgres concede EXECUTE a
-- PUBLIC, y una función SECURITY DEFINER con ese permiso queda expuesta como
-- endpoint REST (ver 0103/0104).
revoke execute on function public.purge_doc_lookups(int) from public, anon, authenticated;
grant execute on function public.purge_doc_lookups(int) to service_role;
