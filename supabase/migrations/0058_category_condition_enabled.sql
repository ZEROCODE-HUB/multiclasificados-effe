-- =====================================================================
-- 0058_category_condition_enabled.sql — "Habilitar condición" por categoría.
-- Si condition_enabled = false, el formulario de publicar OCULTA el campo
-- "Condición" (nuevo/usado/no aplica) para esa categoría. Ej.: Servicios y
-- Empleos, donde vender "nuevo/usado" no tiene sentido. (idempotente)
-- =====================================================================

alter table public.categories
  add column if not exists condition_enabled boolean not null default true;

-- Semilla: categorías donde la condición no aplica.
update public.categories
   set condition_enabled = false
 where id in ('servicios', 'empleos');
