-- =====================================================================
-- 0008_seed.sql — Datos iniciales: categorías y configuración de precios
-- =====================================================================

-- 8 categorías (de src/data/mockData.ts). icon = nombre del icono lucide-react.
insert into public.categories (id, name, icon, sort_order, active) values
  ('inmuebles',            'Inmuebles',             'Home',          1, true),
  ('vehiculos',            'Vehículos',             'Car',           2, true),
  ('empleos',              'Empleos',               'Briefcase',     3, true),
  ('tecnologia',           'Tecnología',            'Smartphone',    4, true),
  ('productos',            'Productos',             'Package',       5, true),
  ('servicios',            'Servicios',             'Wrench',        6, true),
  ('educacion-finanzas',   'Educación y Finanzas',  'GraduationCap', 7, true),
  ('salud-belleza-moda',   'Salud, Belleza y Moda', 'Sparkles',      8, true)
on conflict (id) do nothing;

-- Configuración de precios inicial (DEFAULT_SETTINGS de src/lib/pricing.ts).
insert into public.pricing_settings (base, desc_por_aviso, saltos, extras, is_active)
values (
  16.14,
  0.06,
  '{"15": 0.14, "30": 0.13, "60": 0.12, "90": 0.11}'::jsonb,
  '{"img100": 5, "img500": 5, "pdf100": 5, "pdf500": 5, "urgente": 10, "destacado": 15, "confidencial": 8}'::jsonb,
  true
)
on conflict do nothing;
