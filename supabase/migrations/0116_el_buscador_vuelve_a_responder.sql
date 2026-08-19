-- =====================================================================
-- 0116_el_buscador_vuelve_a_responder.sql
--
-- `search_listings` se recreó en la 0114 (país) y en la 0115 (video_count), y
-- por la 0104 una función recreada nace SIN execute para anon/authenticated.
-- Resultado en producción: el buscador devolvía "0 avisos" a todo el mundo, en
-- silencio —el catch de `listings.ts` traga el 42501 y muestra la lista vacía—
-- aunque la función respondía perfectamente al ejecutarla como postgres.
--
-- Es el mismo tropiezo que la 0104 documenta como consecuencia a recordar. Aquí
-- se repara y se deja el grant escrito para que sobreviva a la próxima recreada.
-- =====================================================================

grant execute on function public.search_listings(
  text, text, uuid, numeric, numeric, public.currency, text, text, int, int, numeric, numeric, text
) to anon, authenticated;

-- La vista que lee esa función: el select ya estaba concedido desde la 0087,
-- pero `create or replace view` no siempre lo conserva si cambia el dueño.
grant select on public.listing_cards to anon, authenticated;
