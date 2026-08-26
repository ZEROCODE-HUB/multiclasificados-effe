-- =====================================================================
-- 0124_limite_de_tasa.sql — un freno para las ráfagas de avisos y mensajes
--
-- Es el hallazgo H-06 de la auditoría de agosto: no había ninguna barrera
-- automática antes de la base de datos ante una creación masiva de avisos o un
-- spam de mensajes. Solo la verificación de documentos (Factiliza) tenía tope,
-- porque ahí cada consulta cuesta dinero y el incentivo era evidente.
--
-- POR QUÉ ESTO VA EN LA BASE DE DATOS Y NO EN UNA EDGE FUNCTION
--
-- La auditoría recomendaba "añadir límite de tasa a nivel de Edge Function o
-- middleware". Aquí no hay dónde ponerlo: publicar y enviar mensajes NO pasan
-- por ninguna Edge Function, van directos de supabase-js a PostgREST
-- (`insert` en `listings` y en `messages`). Meter un intermediario obligaría a
-- reescribir los dos flujos, añadiría un salto de red a la operación más
-- frecuente de la app y crearía un punto de fallo nuevo — y seguiría siendo
-- esquivable, porque la anon key es pública y cualquiera puede llamar a
-- PostgREST directamente saltándose el intermediario.
--
-- Un trigger en la tabla no se puede esquivar: es el mismo sitio donde ya vive
-- el RLS, y da igual por qué ruta llegue la petición.
--
-- POR QUÉ NO HAY TABLA DE CONTADORES
--
-- La tentación es crear `rate_limits(user_id, accion, ventana, conteo)`. No
-- hace falta: los avisos ya están en `listings` con su `owner_id` y su
-- `created_at`, y los mensajes en `messages` con su `sender_id`. Contar sobre
-- los hechos en lugar de sobre un contador paralelo significa que el contador
-- no puede desincronizarse de la realidad —porque ES la realidad—, que no hay
-- filas viejas que limpiar, y que no hay una tabla más que mantener. Es el
-- mismo criterio que el aviso de comprobantes por revisar: una sola fuente.
--
-- DE DÓNDE SALEN LOS NÚMEROS
--
-- No son a ojo. Medido sobre los datos reales del 26-ago-2026, el máximo que
-- ha hecho una sola persona es:
--
--     avisos   → 10 en una hora,  28 en un día
--     mensajes → 20 en una hora,  28 en un día
--
-- Los topes se ponen unas 3 veces por encima de ese máximo observado. Un tope
-- calibrado a ojo tiene dos formas de salir mal, y las dos son caras: si queda
-- corto le corta la publicación a un cliente que está pagando, y si queda largo
-- no frena a nadie y solo da sensación de seguridad.
--
-- Idempotente.
-- =====================================================================

-- ---------- 1. Índices para que contar sea barato ----------
-- Sin esto, cada insert haría un recorrido completo de la tabla. `listings`
-- tenía índice por `owner_id` a secas y `messages` solo por conversación.
create index if not exists listings_owner_created_idx
  on public.listings (owner_id, created_at desc);

create index if not exists messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

-- ---------- 2. Los topes, configurables sin desplegar ----------
insert into public.system_settings (key, value)
values (
  'limites_de_tasa',
  '{"aviso": {"hora": 30, "dia": 100}, "mensaje": {"hora": 60, "dia": 200}}'::jsonb
)
on conflict (key) do nothing;

/**
 * Lee un tope de `system_settings`, cayendo al valor por defecto si no está
 * configurado o si lo que hay no es un número.
 *
 * Es deliberadamente a prueba de basura: esto se ejecuta dentro de un trigger
 * de INSERT, así que un valor mal escrito en la configuración no puede tener
 * como consecuencia que nadie pueda publicar. Ante cualquier duda, el defecto.
 *
 * Un tope de 0 (o negativo) significa SIN LÍMITE. Es la válvula de escape: si
 * un cliente real se topa con el freno un sábado por la tarde, el superadmin lo
 * desactiva desde la configuración sin esperar a un despliegue.
 */
create or replace function public.tope_de_tasa(
  p_accion  text,
  p_ventana text,
  p_defecto int
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(
              regexp_replace(coalesce(value -> p_accion ->> p_ventana, ''), '[^0-9]', '', 'g'),
              ''
            )::int
       from public.system_settings
      where key = 'limites_de_tasa'),
    p_defecto);
$$;

revoke execute on function public.tope_de_tasa(text, text, int) from public;
grant  execute on function public.tope_de_tasa(text, text, int) to service_role;

comment on function public.tope_de_tasa(text, text, int) is
  'Tope de acciones por ventana (hora/día) para el límite de tasa del H-06. '
  'Se lee de system_settings.limites_de_tasa; 0 o negativo = sin límite.';

-- ---------- 3. El freno de los avisos ----------
create or replace function public.frenar_avisos_en_rafaga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hora int;
  v_dia  int;
  v_n    int;
begin
  -- Sin dueño no hay a quién contarle, y el personal queda exento: un
  -- administrador cargando un catálogo no es el abuso que esto persigue.
  if new.owner_id is null or public.is_staff(new.owner_id) then
    return new;
  end if;

  v_hora := public.tope_de_tasa('aviso', 'hora', 30);
  if v_hora > 0 then
    select count(*) into v_n
      from public.listings
     where owner_id = new.owner_id
       and created_at > now() - interval '1 hour';
    if v_n >= v_hora then
      raise exception
        using errcode = 'P0001',
              hint    = 'limite_de_tasa',
              message = 'Has creado muchos avisos en poco tiempo. '
                     || 'Espera unos minutos y vuelve a intentarlo.';
    end if;
  end if;

  v_dia := public.tope_de_tasa('aviso', 'dia', 100);
  if v_dia > 0 then
    select count(*) into v_n
      from public.listings
     where owner_id = new.owner_id
       and created_at > now() - interval '1 day';
    if v_n >= v_dia then
      raise exception
        using errcode = 'P0001',
              hint    = 'limite_de_tasa',
              message = 'Has alcanzado el máximo de avisos por día. '
                     || 'Si necesitas publicar más, escríbenos.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.frenar_avisos_en_rafaga() from public;

drop trigger if exists listings_limite_de_tasa on public.listings;
create trigger listings_limite_de_tasa
  before insert on public.listings
  for each row execute function public.frenar_avisos_en_rafaga();

-- ---------- 4. El freno de los mensajes ----------
create or replace function public.frenar_mensajes_en_rafaga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hora int;
  v_dia  int;
  v_n    int;
begin
  if new.sender_id is null or public.is_staff(new.sender_id) then
    return new;
  end if;

  v_hora := public.tope_de_tasa('mensaje', 'hora', 60);
  if v_hora > 0 then
    select count(*) into v_n
      from public.messages
     where sender_id = new.sender_id
       and created_at > now() - interval '1 hour';
    if v_n >= v_hora then
      raise exception
        using errcode = 'P0001',
              hint    = 'limite_de_tasa',
              message = 'Has enviado muchos mensajes en poco tiempo. '
                     || 'Espera unos minutos y vuelve a intentarlo.';
    end if;
  end if;

  v_dia := public.tope_de_tasa('mensaje', 'dia', 200);
  if v_dia > 0 then
    select count(*) into v_n
      from public.messages
     where sender_id = new.sender_id
       and created_at > now() - interval '1 day';
    if v_n >= v_dia then
      raise exception
        using errcode = 'P0001',
              hint    = 'limite_de_tasa',
              message = 'Has alcanzado el máximo de mensajes por día. '
                     || 'Vuelve a intentarlo mañana.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.frenar_mensajes_en_rafaga() from public;

drop trigger if exists messages_limite_de_tasa on public.messages;
create trigger messages_limite_de_tasa
  before insert on public.messages
  for each row execute function public.frenar_mensajes_en_rafaga();

comment on function public.frenar_avisos_en_rafaga() is
  'H-06: frena la creación masiva de avisos por usuario (ventanas de hora y '
  'día). El personal queda exento. Topes en system_settings.limites_de_tasa.';

comment on function public.frenar_mensajes_en_rafaga() is
  'H-06: frena el spam de mensajes por usuario (ventanas de hora y día). '
  'El personal queda exento. Topes en system_settings.limites_de_tasa.';
