-- =====================================================================
-- 0107_el_precio_no_puede_ser_negativo.sql — el precio de un aviso nunca es
-- menor que cero.
--
-- El campo de precio del formulario es un <input type="number"> sin tope
-- inferior, y `publish.ts` hacía `Number(price) || 0`: un "-5" escrito a mano
-- llegaba tal cual a la columna y se pintaba "S/ -5.00" en la tarjeta, en la
-- ficha y en el mapa. No es un caso hipotético: el campo lo acepta hoy.
--
-- El cliente ya lo impide (min=0 + validación al publicar), pero la BD es lo
-- único que lo impide DE VERDAD: hay más de una vía de escritura (publicar,
-- editar, el panel de administración) y todas terminan en esta columna.
--
-- Los avisos que ya tuvieran un precio negativo pasan a 0, que es como se
-- muestran desde ahora: "Precio a convenir".
--
-- El CHECK se añade en dos pasos (`not valid` y luego `validate`) para no
-- bloquear la tabla entera mientras Postgres recorre todas las filas.
-- Idempotente: re-ejecutable sin efectos.
-- =====================================================================

update public.listings set price = 0 where price < 0;

do $$
begin
  alter table public.listings
    add constraint listings_price_no_negativo check (price >= 0) not valid;
exception
  when duplicate_object then null;  -- ya estaba
end $$;

alter table public.listings validate constraint listings_price_no_negativo;

comment on constraint listings_price_no_negativo on public.listings is
  'El precio de un aviso no puede ser negativo. Sin precio (0) el aviso se '
  'muestra como "Precio a convenir".';
