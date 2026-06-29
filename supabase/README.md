# Supabase — eFFe Multiclasificados

Backend del marketplace de clasificados: Postgres + Auth + Storage + Realtime, con RLS por rol.

> 📖 La referencia **completa** del esquema (tablas, vistas, RPC, triggers, Storage, Realtime,
> cron y cómo crear el proyecto desde cero) está en [`ESTRUCTURA_BD.md`](./ESTRUCTURA_BD.md).
> Este README es el resumen rápido para aplicar las migraciones.

## Cómo aplicar las migraciones

Las migraciones están en `supabase/migrations/` (archivos `0001` … `0034`) y se aplican **en
orden numérico**.

### Opción A — Script Node incluido (recomendado aquí)
```bash
# desde la raíz del proyecto
node supabase/run-migrations.mjs "<CONNECTION_STRING>"
```
Ejecuta todos los archivos `.sql` en orden, cada uno dentro de una transacción. Para aplicar
solo desde cierto archivo en adelante, pasa un prefijo: `node supabase/run-migrations.mjs "<conn>" 0034`.

### Opción B — SQL Editor del dashboard
Copia y pega el contenido de cada archivo `0001` … `0034` en el SQL Editor de Supabase, en orden, y ejecútalos.

### Opción C — Supabase CLI
```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

## Orden y contenido de las migraciones
| Archivo | Contenido |
|---|---|
| `0001_enums.sql` | Tipos enumerados (roles, estados, moneda, etc.) |
| `0002_core_tables.sql` | `profiles`, `user_roles`, `categories`, `listings`, imágenes y documentos |
| `0003_engagement.sql` | favoritos, búsquedas guardadas, chat, postulaciones, notificaciones, eventos |
| `0004_commerce.sql` | precios, órdenes, comprobantes (boletas/facturas) |
| `0005_moderation.sql` | reportes, comunicaciones, auditoría |
| `0006_functions_rls.sql` | `has_role()`, trigger de alta de usuario, **todas las políticas RLS**, Realtime |
| `0007_storage.sql` | buckets `listing-images`, `avatars`, `listing-docs` y sus políticas |
| `0008_seed.sql` | 8 categorías + configuración de precios inicial |
| `0009_req_enums.sql` | enums `message_status`, `notification_channel`, `report_target_type` |
| `0010_subcategories_search.sql` | subcategorías + `search_listings` (radio KM) |
| `0011_favorites_stats.sql` | `toggle_favorite`, `track_event`, vista `listing_stats` |
| `0012_messaging.sql` | estados de mensaje + `mark_messages_delivered/read` |
| `0013_reviews.sql` | reseñas + elegibilidad + recálculo de rating |
| `0014_notifications.sql` | `notification_preferences`, `notify_user`, triggers de eventos |
| `0015_reports_moderation.sql` | reportes polimórficos (avisos y usuarios) |
| `0016_saved_search_expiry.sql` | alertas de búsquedas, `expire_listings`, `publish_listing` |
| `0017_cron.sql` | cron de expiración y alertas (`pg_cron`) |
| `0018_listing_cards.sql` | vista `listing_cards` + `search_listings` que la devuelve |
| `0019_invoice_owner_insert.sql` | el dueño de la orden puede emitir su comprobante |
| `0020_search_partial.sql` | buscador con coincidencia parcial (ILIKE) |
| `0021_review_cards.sql` | vista `review_cards` |
| `0022_realtime_replica_identity.sql` | REPLICA IDENTITY FULL en chat |
| `0023_admin_panel.sql` | panel admin: RBAC, `system_settings`, ~20 RPC `admin_*`, auditoría |
| `0024_admin_delete_user.sql` | `admin_delete_user` (solo superadmin) |
| `0024_notifications_replica_identity.sql` | REPLICA IDENTITY FULL en notificaciones |
| `0025_device_tokens.sql` | `device_tokens` + `register_device_token` |
| `0026_push_trigger.sql` | trigger push a la Edge Function `send-push` (`pg_net`) |
| `0027_advertiser_stats.sql` | `advertiser_stats()` (REQ-08) |
| `0028_platform_stats.sql` | `platform_stats()` para el landing |
| `0029_admin_listing_status_reason.sql` | `admin_set_listing_status` con motivo (`reason`) |
| `0029_category_counts.sql` | `category_counts()` para el grid de categorías (anon) |
| `0030_admin_report_analytics.sql` | vista `listing_revenue` + RPC de analítica de reportes |
| `0031_report_filters.sql` | recrea esos 3 RPC con rango de fechas opcional |
| `0032_listing_disabled_notify.sql` | `admin_set_listing_status` notifica al dueño |
| `0033_admin_set_user_role.sql` | `admin_set_user_role` (solo superadmin) |
| `0034_libro_reclamaciones.sql` | tabla `complaints` (Libro de Reclamaciones Indecopi), RLS solo staff |

> ⚠️ Hay **dos** archivos con prefijo `0024` y **dos** con `0029`; cada par es idempotente y el
> orden entre ellos no importa. El runner los aplica alfabéticamente.

## Habilitar Google OAuth (login con Gmail)
1. Dashboard → **Authentication → Providers → Google** → Enable.
2. Crear credenciales OAuth en Google Cloud Console (Client ID + Secret).
3. Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
4. Pegar Client ID y Secret en Supabase y guardar.

## Variables de entorno del frontend (`.env`)
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

## Diagrama de relaciones (ER)
```
auth.users 1─1 profiles 1─* user_roles
profiles 1─* listings *─1 categories
listings 1─* listing_images / listing_documents / reports / listing_events
profiles *─* listings  (favorites)
listings 1─* conversations 1─* messages
listings 1─* job_applications
profiles 1─* orders 1─* order_listings *─1 listings
orders 1─1 invoices
complaints  (Libro de Reclamaciones; user_id → auth.users, nullable)
```
