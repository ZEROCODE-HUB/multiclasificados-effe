-- =====================================================================
-- 0129_modulo_libro_de_reclamaciones.sql — el módulo del panel para B-09
--
-- La pantalla del Libro de Reclamaciones necesita su propio módulo en la matriz
-- de permisos. No vale reutilizar "Conversaciones reportadas" —que en el menú se
-- llama "Reclamos"— porque son cosas distintas: aquella son denuncias entre
-- usuarios y su moderación; esta es el Libro que exige Indecopi, con datos
-- personales del consumidor, plazos legales y respuestas que hay que acreditar.
--
-- Mezclarlas significaría que quien puede moderar un chat pueda también leer
-- documentos de identidad y domicilios de quien reclamó, que no es lo mismo.
--
-- QUIÉN ENTRA
--
-- Admin y superadmin, con edición: son quienes responden.
-- Soporte solo mira: puede necesitar consultar un reclamo para atender a alguien
-- por teléfono, pero contestar formalmente a un reclamo compromete a la empresa
-- en un plazo legal y no debería salir de administración.
-- Moderador no entra: su trabajo son los avisos y los chats, no el Libro.
--
-- Idempotente.
-- =====================================================================

insert into public.role_permissions (role, module, can_view, can_edit, can_approve, can_delete)
values
  ('admin',      'Libro de Reclamaciones', true,  true,  false, false),
  ('superadmin', 'Libro de Reclamaciones', true,  true,  false, false),
  ('soporte',    'Libro de Reclamaciones', true,  false, false, false),
  ('moderador',  'Libro de Reclamaciones', false, false, false, false)
on conflict (role, module) do nothing;

-- `do nothing` y no `do update`: si alguien ya ajustó estos permisos desde el
-- panel de Roles, un despliegue no puede devolverlos a los de fábrica sin
-- avisar. Es la misma razón por la que los topes de la 0124 no se pisan.
