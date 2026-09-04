-- =====================================================================
-- 0147_las_funciones_de_la_descripcion_nacen_cerradas.sql
--
-- Arregla un fallo que dejó los avisos SIN PODER MODIFICARSE.
--
-- ── QUÉ PASÓ ─────────────────────────────────────────────────────────
--
-- La 0146 creó tres funciones y las dejó sin `grant execute`. Por la 0104, en
-- esta base una función nueva NACE SIN EXECUTE para `anon` y `authenticated`
-- (se le revocó a PUBLIC el permiso por defecto). El resultado en producción:
--
--     ERROR: 42501: permission denied for function texto_con_formato_valido
--
-- ── Y POR QUÉ ROMPIÓ MUCHO MÁS QUE LA DESCRIPCIÓN ────────────────────
--
-- Porque quien llama a la función no es el formulario, sino la RESTRICCIÓN:
--
--     check (public.texto_con_formato_valido(description_rich))
--
-- Un CHECK se evalúa en CADA insert y en CADA update de la fila, MIRE LA COLUMNA
-- QUE MIRE. Así que sin ese permiso no fallaba «guardar una descripción con
-- negrita»: fallaba TODO lo que toca un aviso —guardar un borrador, publicar,
-- editar, pausar, reactivar, republicar, adjuntar el PDF, moderar desde el
-- panel—, y siempre con un mensaje que no menciona los avisos por ninguna parte.
--
-- Lo mismo vale para el disparador: `sincronizar_descripcion` no es SECURITY
-- DEFINER, así que su cuerpo corre con los permisos de quien escribe y las dos
-- funciones que llama necesitan EXECUTE igual.
--
-- ── LA LECCIÓN, QUE YA ES LA TERCERA ─────────────────────────────────
--
-- Esta es la misma trampa de la 0136 (un DROP + CREATE que perdió los grants y
-- dejó el buscador vacío). La regla, sin excepciones: TODA función nueva de
-- `public` termina con su `revoke` + `grant` explícitos en la misma migración.
-- No se hereda nada.
--
-- Idempotente.
-- =====================================================================

-- Las tres son puras: reciben un jsonb y devuelven un booleano o un texto. No
-- leen ninguna tabla, así que darles EXECUTE no expone absolutamente nada; lo
-- que decide quién puede escribir un aviso sigue siendo la RLS.
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.texto_con_formato_valido(jsonb)',
    'public.texto_plano_del_formato(jsonb)'
  ] loop
    execute format('revoke all on function %s from public', v_fn);
    execute format('grant execute on function %s to anon, authenticated', v_fn);
  end loop;
end;
$$;

-- El disparador no necesita EXECUTE para dispararse (Postgres no lo comprueba
-- ahí), pero se le da igualmente: si algún día alguien lo llamara a mano desde
-- otra función, el fallo volvería con otra cara.
revoke all on function public.sincronizar_descripcion() from public;
grant execute on function public.sincronizar_descripcion() to anon, authenticated;
