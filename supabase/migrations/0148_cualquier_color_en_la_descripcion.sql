-- =====================================================================
-- 0148_cualquier_color_en_la_descripcion.sql
--
-- El color de la descripción deja de ser una lista de cuatro.
--
-- ── QUÉ CAMBIA ───────────────────────────────────────────────────────
--
-- Hasta ahora `c` guardaba el NOMBRE de un color de la paleta ('azul', 'rojo'…)
-- y cualquier otra cosa se rechazaba. El cliente pidió poder elegir el color que
-- sea, así que ahora `c` guarda el TONO, en `#rrggbb` y en minúsculas:
--
--     [{"t":"Depa "}, {"t":"amoblado","b":true,"c":"#7c3aed"}]
--
-- ── LO QUE NO SE AFLOJA ──────────────────────────────────────────────
--
-- Que se admita cualquier tono NO significa que se admita cualquier texto. Este
-- valor termina en un `style` de la ficha que abre cualquier visitante, así que
-- la forma se sigue comprobando con una expresión estricta:
--
--     ^#[0-9a-f]{6}$
--
-- Exactamente seis dígitos, en minúsculas y nada más. Un valor con un `;` o con
-- un paréntesis no llega a guardarse, que es donde tiene que pararse. El
-- navegador aplica la misma regla antes de pintar (`esColorValido`), porque una
-- sola barrera no es una barrera.
--
-- ── LOS AVISOS QUE YA TENÍAN COLOR ───────────────────────────────────
--
-- Se convierten aquí mismo: los cuatro nombres pasan a su tono. Al escribir esta
-- migración se dio por hecho que no habría ninguno —la 0146 estuvo rota hasta la
-- 0147 y casi nada pudo guardarse con formato—, y al aplicarla apareció uno. Por
-- eso además de convertir queda una comprobación al final: si después del cambio
-- sobrevive algún color que no encaje, la migración se DETIENE en vez de dejar
-- filas que incumplen su propio CHECK.
--
-- El ORDEN importa. Primero se cambia la función, luego se convierten las filas y
-- solo al final se rehace la restricción:
--
--   · convertir antes de cambiar la función, y el CHECK viejo rechazaría los
--     tonos por no ser ninguno de los cuatro nombres;
--   · rehacer la restricción antes de convertir, y su validación tumbaría la
--     migración por las filas que aún no se han tocado.
--
-- Idempotente.
-- =====================================================================

create or replace function public.texto_con_formato_valido(p jsonb)
returns boolean
language sql
immutable
as $function$
  select case
    when p is null then true
    when jsonb_typeof(p) <> 'array' then false
    -- Un tope de fragmentos: sin él, 2000 caracteres podrían llegar partidos en
    -- 2000 nodos y cada ficha pintaría 2000 elementos.
    when jsonb_array_length(p) = 0 or jsonb_array_length(p) > 300 then false
    else not exists (
      select 1 from jsonb_array_elements(p) e
      where jsonb_typeof(e) <> 'object'
         -- Solo las tres claves conocidas. Cualquier otra cosa es basura o un
         -- intento de colar algo que el renderizador de mañana podría mirar.
         or exists (select 1 from jsonb_object_keys(e) k where k not in ('t','b','c'))
         or coalesce(jsonb_typeof(e->'t'), 'null') <> 'string'
         or (e ? 'b' and e->'b' <> 'true'::jsonb)
         -- El color, por su FORMA y no por una lista: seis dígitos hexadecimales
         -- en minúsculas. Ni un carácter más.
         or (e ? 'c' and coalesce(e->>'c', '') !~ '^#[0-9a-f]{6}$')
    )
  end;
$function$;

comment on function public.texto_con_formato_valido(jsonb) is
  'Valida la estructura de `listings.description_rich`. El color se admite libre '
  'pero SOLO con la forma #rrggbb: acaba en un `style` de la ficha pública. Se '
  'comprueba en la BASE y no solo en el navegador porque cualquiera con la llave '
  'anónima puede escribir en sus propios avisos: la RLS dice QUIÉN escribe, no QUÉ.';

-- `create or replace` conserva los permisos, pero se repiten por si algún día
-- alguien la recrea con DROP + CREATE: es lo que costó la 0146 (ver 0147).
revoke all on function public.texto_con_formato_valido(jsonb) from public;
grant execute on function public.texto_con_formato_valido(jsonb) to anon, authenticated;


-- ---------- Los avisos que ya tenían color ----------
-- Los cuatro nombres de la 0146 pasan a su tono. Se reconstruye el array entero
-- conservando el ORDEN (`with ordinality`), que es lo que da el texto plano.
update public.listings l
   set description_rich = (
     select jsonb_agg(
              case when e ? 'c'
                   then jsonb_set(e, '{c}', to_jsonb(coalesce(
                          ('{"azul":"#162950","naranja":"#bd4e05",'
                           '"verde":"#059669","rojo":"#dc2626"}')::jsonb ->> (e->>'c'),
                          e->>'c')))
                   else e end
              order by ord)
       from jsonb_array_elements(l.description_rich) with ordinality as x(e, ord)
   )
 where l.description_rich is not null
   and exists (
     select 1 from jsonb_array_elements(l.description_rich) e
      where e ? 'c' and coalesce(e->>'c', '') !~ '^#[0-9a-f]{6}$'
   );

-- Y si algo no se pudo convertir, se para aquí. Un color inventado por la API
-- no tiene traducción posible y no se va a adivinar.
do $$
declare
  v_raros integer;
begin
  select count(*) into v_raros
    from public.listings
   where description_rich is not null
     and exists (
       select 1 from jsonb_array_elements(description_rich) e
        where e ? 'c' and coalesce(e->>'c', '') !~ '^#[0-9a-f]{6}$'
     );

  if v_raros > 0 then
    raise exception
      'Quedan % avisos con un color que no se pudo traducir a #rrggbb.', v_raros;
  end if;
end;
$$;

-- La restricción se rehace para que Postgres vuelva a comprobar las filas con la
-- definición nueva.
alter table public.listings
  drop constraint if exists listings_description_rich_check;
alter table public.listings
  add constraint listings_description_rich_check
  check (public.texto_con_formato_valido(description_rich));
