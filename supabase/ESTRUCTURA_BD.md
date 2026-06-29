# Estructura de la Base de Datos — eFFe Multiclasificados

Documento de referencia del backend (Supabase / PostgreSQL) del marketplace de avisos
clasificados. Describe **toda** la estructura de datos y explica **cómo crear el proyecto
en Supabase desde cero**.

> El esquema vive en `supabase/migrations/` (archivos `0001` … `0034`) y se aplica **en orden
> numérico**. Este documento es el mapa de lo que esas migraciones construyen.

---

## 1. Stack y resumen

- **Motor:** PostgreSQL gestionado por **Supabase** (Auth + Storage + Realtime + Edge Functions).
- **Seguridad:** Row Level Security (RLS) en todas las tablas + funciones `SECURITY DEFINER`
  para las operaciones de staff/sistema.
- **Extensiones requeridas:** `pgcrypto` (UUIDs, viene por defecto), `pg_cron` (tareas
  periódicas) y `pg_net` (HTTP saliente para push). `pg_cron` y `pg_net` se habilitan desde
  el SQL (`create extension …`) o desde **Database → Extensions** en el dashboard.
- **~24 tablas**, **5 vistas**, ~50 **funciones/RPC**, triggers, 3 **buckets** de Storage,
  Realtime en chat/notificaciones y 2 **cron jobs**.

### Módulos funcionales (requisitos)
| Req | Módulo | Tablas / objetos clave |
|---|---|---|
| REQ-01 | Avisos + vigencia/expiración | `listings`, `publish_listing`, `expire_listings` |
| REQ-02 | Buscador (precio, radio KM, orden) + subcategorías | `subcategories`, `search_listings`, vista `listing_cards`, `category_counts` (grid landing) |
| REQ-03 | Favoritos | `favorites`, `toggle_favorite` |
| REQ-04 | Búsquedas guardadas + alertas | `saved_searches`, `run_saved_search_alerts` (cron) |
| REQ-05 | Chat en tiempo real con estados | `conversations`, `messages`, Realtime |
| REQ-06 | Postulaciones a empleos | `job_applications` |
| REQ-07 | Reseñas (solo postulación aceptada) | `reviews`, vista `review_cards` |
| REQ-08 | Estadísticas del anunciante | `listing_events`, `advertiser_stats`, vista `listing_stats` |
| REQ-09 | Notificaciones (in-app/push/email) | `notifications`, `notification_preferences`, `notify_user` |
| REQ-10 | Reportes/moderación (avisos y usuarios) | `reports` (polimórfico), `admin_claims_summary` |
| REQ-ADM | Panel admin/superadmin (RBAC, auditoría, analítica) | `role_permissions`, `system_settings`, `audit_logs`, ~25 RPC `admin_*`, vista `listing_revenue` |
| — | Comercio (paquetes, comprobantes) | `pricing_settings`, `orders`, `order_listings`, `invoices` |
| — | Push móvil (FCM) | `device_tokens`, Edge Function `send-push` |
| — | Libro de Reclamaciones (Indecopi) | `complaints`, Edge Function `send-reclamo` |

---

## 2. Crear el proyecto en Supabase **desde cero**

### Paso 1 — Crear el proyecto
1. Entra a [app.supabase.com](https://app.supabase.com) → **New project**.
2. Elige organización, **nombre**, **contraseña de la base de datos** (guárdala) y región
   (recomendado **South America (São Paulo)** por latencia desde Perú).
3. Espera a que el proyecto quede aprovisionado. Anota el **Project Ref** (ej.
   `prhbgniwymaaevnisyov`) que aparece en la URL y en **Settings → General**.

### Paso 2 — Aplicar las migraciones (elige UNA opción)

**Opción A — Script Node incluido (recomendado).** Aplica todos los `.sql` en orden, cada uno
en su propia transacción.
```bash
# Cadena de conexión: Supabase → Settings → Database → Connection string → URI
# (usa el puerto 5432 directo, o el Session Pooler 6543 si tu red bloquea el 5432)
node supabase/run-migrations.mjs "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
```
Para aplicar solo desde cierto archivo en adelante (incremental), pasa un prefijo como 3er
argumento: `node supabase/run-migrations.mjs "<conn>" 0025`.

**Opción B — SQL Editor del dashboard.** Abre **SQL Editor** y pega/ejecuta el contenido de
cada archivo `0001` … `0034` **en orden numérico**, uno por uno.

**Opción C — Supabase CLI.**
```bash
npx supabase link --project-ref <REF>
npx supabase db push
```

> **Extensiones:** `0017_cron.sql` hace `create extension pg_cron` y `0026_push_trigger.sql`
> hace `create extension pg_net`. En proyectos nuevos puede requerirse habilitarlas primero
> desde **Database → Extensions**. Si `pg_cron`/`pg_net` no están disponibles, el resto del
> esquema se aplica igual; solo se pierden las tareas periódicas y el push automático.

> **Nombres duplicados:** hay dos archivos `0024_*` y dos `0029_*` (ver índice §11). Cada par
> es idempotente y el orden entre ellos no afecta; el runner los aplica alfabéticamente.

### Paso 3 — Storage
Los buckets (`listing-images`, `avatars`, `listing-docs`) y sus políticas se crean en
`0007_storage.sql`. No necesitas crearlos a mano si corriste las migraciones.

### Paso 4 — Auth: Google OAuth (login con Gmail)
1. **Authentication → Providers → Google** → *Enable*.
2. Crea credenciales OAuth en **Google Cloud Console** (Client ID + Secret).
3. Authorized redirect URI: `https://<REF>.supabase.co/auth/v1/callback`.
4. Pega Client ID y Secret en Supabase y guarda.
5. En **Authentication → URL Configuration** define el **Site URL** (dominio del frontend) y
   agrega el **Redirect URL** `…/auth/callback`.

### Paso 5 — Edge Functions (opcionales)
Funciones en `supabase/functions/`:
- `admin-reset-password` — envía reset de contraseña (usa `SUPABASE_SERVICE_ROLE_KEY`).
- `send-push` — envía push a FCM leyendo `device_tokens` (la dispara `0026_push_trigger.sql`).
- `send-reclamo` — persiste el reclamo en `complaints` (con service_role) y envía el correo del
  Libro de Reclamaciones vía **Resend**. Secrets: `RESEND_API_KEY`, `RECLAMOS_TO` (coma-sep,
  default los correos de coleffe) y `RECLAMOS_FROM`. Guía en `functions/send-reclamo/DEPLOY.md`.
- `verify-captcha` — valida el captcha de los formularios públicos.
```bash
npx supabase functions deploy admin-reset-password
npx supabase functions deploy send-push
npx supabase functions deploy send-reclamo --no-verify-jwt
```

### Paso 6 — Variables de entorno del frontend (`.env`)
```
VITE_SUPABASE_URL=https://<REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>     # Settings → API
```

### Paso 7 — Crear el primer superadmin
Regístrate normalmente en la app (eso crea el `profiles` + rol `buscador` por el trigger), y
luego, en el SQL Editor:
```sql
insert into public.user_roles (user_id, role)
select id, 'superadmin' from public.profiles where email = 'tu-correo@gmail.com'
on conflict do nothing;
```

---

## 3. Tipos enumerados (ENUMs)

> Definidos en `0001_enums.sql`; ampliados en `0009_req_enums.sql` y `0023_admin_panel.sql`.

| Enum | Valores |
|---|---|
| `app_role` | `anunciante`, `buscador`, `admin`, `superadmin`, `moderador`, `soporte` |
| `listing_status` | `draft`, `pending`, `active`, `paused`, `expired`, `rejected`, `sold` |
| `currency` | `PEN`, `USD` |
| `listing_condition` | `nuevo`, `usado`, `na` |
| `order_status` | `pending`, `paid`, `failed`, `refunded` |
| `invoice_type` | `boleta`, `factura` |
| `report_status` | `open`, `reviewing`, `resolved` |
| `application_status` | `pending`, `reviewed`, `accepted`, `rejected` |
| `doc_type` | `dni`, `ruc`, `ce` |
| `message_status` | `sent`, `delivered`, `read` |
| `notification_channel` | `in_app`, `push`, `email` |
| `report_target_type` | `listing`, `user` |

---

## 4. Tablas

### Núcleo (`0002_core_tables.sql`)
- **`profiles`** — 1:1 con `auth.users` (PK = `auth.users.id`, `on delete cascade`). Datos:
  `full_name`, `initials`, `phone`, `doc_type`, `doc_number`, `verified`, `status`
  (`active`/`suspended`/`pending`/`banned`), `rating`, `avatar_url`, `email`,
  `suspended_until`, `ban_reason`, timestamps. (Los 3 últimos los agrega `0023`.)
- **`user_roles`** — multi-rol por usuario. PK (`user_id`, `role`).
- **`categories`** — PK textual (slug). `name`, `icon` (lucide-react), `sort_order`, `active`.
- **`listings`** — entidad central. `owner_id`, `category_id`, `subcategory_id`, `title`,
  `description`, `price`, `currency`, `condition`, `location`, `lat`, `lng`, `status`,
  `featured`, `urgent`, `confidential`, `views`, `published_at`, `expires_at`,
  `rejection_reason`, timestamps. Índices: estado+categoría, owner, geo (`lat,lng`) y **GIN
  full-text** español sobre título+descripción.
- **`listing_images`** — imágenes del aviso (`storage_path`, `url`, `sort_order`).
- **`listing_documents`** — PDFs/confidenciales (privados).

### Engagement (`0003_engagement.sql`)
- **`favorites`** — PK (`user_id`, `listing_id`).
- **`saved_searches`** — `criteria` (jsonb), `alert_enabled`, `last_run_at`, `last_notified_at`.
- **`conversations`** — (`listing_id`, `buyer_id`, `seller_id`) únicos; `last_message`/`_at`.
- **`messages`** — `conversation_id`, `sender_id`, `body`, `status` (`sent`/`delivered`/`read`),
  `read_at`, `delivered_at`. **Realtime + REPLICA IDENTITY FULL**.
- **`job_applications`** — postulación a empleos. (`listing_id`, `applicant_id`) único, `status`.
- **`notifications`** — `type`, `channel`, `title`, `payload` (jsonb), `read_at`. **Realtime**.
- **`listing_events`** — analítica (`view`/`contact_click`/`phone_click`), `visitor_key` para
  vistas únicas.

### Comercio (`0004_commerce.sql`)
- **`pricing_settings`** — `base`, `desc_por_aviso`, `saltos` (jsonb), `extras` (jsonb),
  `is_active` (índice único parcial: solo una fila activa).
- **`orders`** — `listing_qty`, `duration_days`, `extras`, `subtotal`, `igv`, `total`, `status`,
  `payment_provider`, `payment_ref`.
- **`order_listings`** — N avisos por orden. PK (`order_id`, `listing_id`).
- **`invoices`** — comprobantes. `number` único autogenerado `B001-000001` (secuencia +
  trigger `set_invoice_number`), `type`, `amount`, `detail`.

### Moderación / sistema (`0005`, `0015`, `0023`)
- **`reports`** — denuncias **polimórficas**: `target_type` (`listing`/`user`), `listing_id`
  (nullable), `target_user_id`, `reason`, `category`, `status`, `assigned_to`, `action_taken`,
  `resolution_note`, `resolved_by/_at`. Constraint: apunta a exactamente un objetivo.
- **`communications`** — anuncios masivos del admin (`audience`).
- **`audit_logs`** — auditoría (`actor_id`, `action`, `entity_type/id`, `metadata`, `ip`).

### Subcategorías y reseñas (`0010`, `0013`)
- **`subcategories`** — `category_id`, `name`, `slug` (único por categoría).
- **`reviews`** — `rating` 1–5 (check), (`listing_id`, `reviewer_id`) único. Trigger de
  elegibilidad (solo con postulación `accepted`) + recálculo de `profiles.rating`.

### Notificaciones, RBAC, push (`0014`, `0023`, `0025`)
- **`notification_preferences`** — canales por (`user_id`, `event_type`): `in_app/push/email`.
- **`role_permissions`** — matriz RBAC por (`role`, `module`): `can_view/edit/approve/delete`.
- **`system_settings`** — config global clave/valor (jsonb).
- **`device_tokens`** — token FCM por dispositivo (`token` único, `platform`).

### Libro de Reclamaciones (`0034`)
- **`complaints`** — Hoja de Reclamación Indecopi. `code` (correlativo `bigint` autoincremental =
  N.º de hoja), `kind` (`reclamo`/`queja`), datos del consumidor (`full_name`, `doc_type`
  DNI/CE/Pasaporte/RUC, `doc_number`, `email`, `phone`, `address`), `good_type`
  (`producto`/`servicio`), `amount`, `description`, `request`, `status`
  (`pendiente`/`en_proceso`/`resuelto`) y `user_id` (nullable). **RLS:** solo el staff (`is_staff`)
  puede `select`/`update`; **no hay policy de INSERT** — el alta llega siempre por la Edge
  Function `send-reclamo` con service_role (evita spam directo desde el cliente).

---

## 5. Vistas

| Vista | Definida en | Qué expone |
|---|---|---|
| `public_profiles` | `0002` | Solo columnas seguras del perfil (sin `doc_number`/`phone`). |
| `listing_stats` | `0011` | Por aviso: vistas únicas, clics, nº de favoritos. |
| `listing_cards` | `0018` | "Tarjeta" pública: aviso `active` + anunciante (nombre/rating) + imagen. |
| `review_cards` | `0021` | Reseñas con datos públicos del autor (nombre/iniciales/avatar). |
| `listing_revenue` | `0030` | Ingreso real por aviso = total de la orden pagada repartido en partes iguales entre sus avisos (evita doble conteo de paquetes). |

---

## 6. Funciones y RPC

### Helpers de seguridad y sistema
- `has_role(uid, role)`, `is_staff(uid)` — chequeo de roles (`SECURITY DEFINER`, evitan
  recursión en RLS).
- `handle_new_user()` — trigger sobre `auth.users`: crea `profiles` + rol `buscador` (incluye
  `email` desde `0023`).
- `set_updated_at()`, `touch_conversation()`, `set_invoice_number()` — triggers utilitarios.

### Dominio (invocadas desde el frontend)
- `search_listings(...)` — buscador con full-text español + ILIKE parcial, filtros de precio,
  moneda, subcategoría y **radio KM (Haversine)**, orden configurable. Devuelve `listing_cards`.
- `toggle_favorite(listing)` — like/unlike en una llamada.
- `track_event(listing, type, visitor)` — registra evento; cuenta vista única e incrementa
  `views`.
- `publish_listing(listing, duration_days)` — activa el aviso y fija `published_at`/`expires_at`.
- `mark_messages_delivered(conv)`, `mark_messages_read(conv)` — estados del chat.
- `notify_user(user, event, title, payload)` — crea notificación respetando preferencias.
- `register_device_token(token, platform)` — alta/actualización de token push.
- `advertiser_stats()` — totales + desglose por aviso + tendencia 30 días del usuario.
- `platform_stats()` — métricas públicas del landing (anon).
- `category_counts()` — conteo de avisos `active` por categoría para el grid del landing (anon).
- `expire_listings()`, `run_saved_search_alerts()` — usadas por cron.

### Panel admin/superadmin (`0023`, `0024`, `0029`–`0033`) — todas `SECURITY DEFINER`, validan rol adentro
`admin_stats`, `admin_growth_series`, `admin_category_distribution`, `admin_list_users`,
`admin_set_user_status`, `admin_verify_user`, `admin_user_activity`, `admin_delete_user`
(solo superadmin), `admin_set_listing_status`, `admin_toggle_featured`, `admin_list_listings`,
`admin_list_reports`, `admin_assign_report`, `admin_resolve_report`, `admin_assign_role`,
`admin_remove_role`, `get_my_permissions`, `set_role_permission`, `admin_list_permissions`,
`admin_role_counts`, `get_settings`, `set_setting`, `log_audit`.

Agregadas en `0029`–`0033`:
- `admin_set_listing_status(listing, status, reason)` — versión de **3 argumentos** (`0029`,
  reemplaza la de 2): al rechazar/deshabilitar guarda el `reason` en `listings.rejection_reason`
  y lo limpia al reactivar. Desde `0032` además **notifica al dueño** (`notify_user`) con los
  eventos `listing_disabled` (con motivo) / `listing_enabled`.
- `admin_category_revenue(from, to)`, `admin_region_distribution(from, to)`,
  `admin_claims_summary(from, to)` — analítica de la pantalla Reportes (avisos+ingresos por
  categoría y por región, resumen de denuncias + tendencia 6 meses). Introducidas en `0030`
  y recreadas en `0031` con **rango de fechas opcional** (`p_from`/`p_to` sobre `created_at`).
- `admin_set_user_role(user, role)` — **solo superadmin** (`0033`): **reemplaza todos los roles**
  del usuario por el seleccionado (rol único); no permite cambiar el propio rol.

---

## 7. Triggers

| Trigger | Tabla | Acción |
|---|---|---|
| `on_auth_user_created` | `auth.users` | Crea perfil + rol al registrarse. |
| `profiles_updated_at` / `listings_updated_at` | `profiles`/`listings` | Mantiene `updated_at`. |
| `invoices_set_number` | `invoices` | Genera `B001-000001`. |
| `messages_touch_conv` | `messages` | Actualiza resumen de la conversación. |
| `messages_notify` | `messages` | Notifica nuevo mensaje al otro participante. |
| `applications_notify` | `job_applications` | Notifica cambio de estado de postulación. |
| `reviews_eligibility` | `reviews` | Exige postulación `accepted` y no auto-reseña. |
| `reviews_recalc` | `reviews` | Recalcula `profiles.rating`. |
| `reviews_notify` | `reviews` | Notifica nueva reseña. |
| `notifications_push` | `notifications` | POST a Edge Function `send-push` (FCM). |

---

## 8. Storage (`0007_storage.sql`)

| Bucket | Público | Política |
|---|---|---|
| `listing-images` | Sí | Lectura pública; escribe el dueño en su carpeta (`/{uid}/…`). |
| `avatars` | Sí | Igual que arriba. |
| `listing-docs` | No | Solo el dueño lee/escribe; servir vía URLs firmadas. |

---

## 9. Realtime, Cron y extensiones

- **Realtime:** `messages`, `conversations` y `notifications` están en la publicación
  `supabase_realtime` con **REPLICA IDENTITY FULL** (necesario para que los `UPDATE` de
  estado pasen RLS — migraciones `0022` y `0024_notifications_replica_identity`).
- **Cron (`0017_cron.sql`, requiere `pg_cron`):**
  - `expire-listings` — cada 30 min → `expire_listings()`.
  - `saved-search-alerts` — cada 15 min → `run_saved_search_alerts()`.
- **`pg_net` (`0026`):** permite el POST HTTP del trigger de push.

---

## 10. Datos iniciales (`0008_seed.sql`)

- **8 categorías:** inmuebles, vehículos, empleos, tecnología, productos, servicios,
  educación-finanzas, salud-belleza-moda.
- **Subcategorías** comunes (`0010`).
- **`pricing_settings`** inicial: `base=16.14`, `desc_por_aviso=0.06`, saltos por duración y
  extras (imágenes/pdf/urgente/destacado/confidencial).

---

## 11. Índice de migraciones

| Archivo | Contenido |
|---|---|
| `0001_enums.sql` | Tipos enumerados del dominio. |
| `0002_core_tables.sql` | `profiles`, `user_roles`, `categories`, `listings`, imágenes, documentos + vista `public_profiles`. |
| `0003_engagement.sql` | favoritos, búsquedas, chat, postulaciones, notificaciones, eventos. |
| `0004_commerce.sql` | precios, órdenes, comprobantes. |
| `0005_moderation.sql` | reportes, comunicaciones, auditoría. |
| `0006_functions_rls.sql` | helpers de rol, trigger de alta, **todas las políticas RLS**, Realtime chat. |
| `0007_storage.sql` | buckets y políticas de Storage. |
| `0008_seed.sql` | categorías + pricing inicial. |
| `0009_req_enums.sql` | enums `message_status`, `notification_channel`, `report_target_type`. |
| `0010_subcategories_search.sql` | subcategorías + `search_listings` (radio KM). |
| `0011_favorites_stats.sql` | `toggle_favorite`, `track_event`, vista `listing_stats`. |
| `0012_messaging.sql` | estados de mensaje + `mark_messages_delivered/read`. |
| `0013_reviews.sql` | reseñas + elegibilidad + recálculo de rating. |
| `0014_notifications.sql` | `notification_preferences`, `notify_user`, triggers de eventos. |
| `0015_reports_moderation.sql` | reportes polimórficos (avisos y usuarios). |
| `0016_saved_search_expiry.sql` | alertas de búsquedas, `expire_listings`, `publish_listing`. |
| `0017_cron.sql` | cron de expiración y alertas (`pg_cron`). |
| `0018_listing_cards.sql` | vista `listing_cards` + `search_listings` que la devuelve. |
| `0019_invoice_owner_insert.sql` | el dueño de la orden puede emitir su comprobante. |
| `0020_search_partial.sql` | buscador con coincidencia parcial (ILIKE). |
| `0021_review_cards.sql` | vista `review_cards`. |
| `0022_realtime_replica_identity.sql` | REPLICA IDENTITY FULL en chat. |
| `0023_admin_panel.sql` | panel admin: RBAC, `system_settings`, ~20 RPC `admin_*`, auditoría. |
| `0024_admin_delete_user.sql` | `admin_delete_user` (solo superadmin). |
| `0024_notifications_replica_identity.sql` | REPLICA IDENTITY FULL en notificaciones. |
| `0025_device_tokens.sql` | `device_tokens` + `register_device_token`. |
| `0026_push_trigger.sql` | trigger push a la Edge Function `send-push` (`pg_net`). |
| `0027_advertiser_stats.sql` | `advertiser_stats()` (REQ-08). |
| `0028_platform_stats.sql` | `platform_stats()` para el landing. |
| `0029_admin_listing_status_reason.sql` | `admin_set_listing_status` con motivo (`reason`) → `rejection_reason`. |
| `0029_category_counts.sql` | `category_counts()` para el grid de categorías del landing (anon). |
| `0030_admin_report_analytics.sql` | Vista `listing_revenue` + RPC `admin_category_revenue` / `admin_region_distribution` / `admin_claims_summary`. |
| `0031_report_filters.sql` | Recrea esos 3 RPC con rango de fechas opcional (`p_from`/`p_to`). |
| `0032_listing_disabled_notify.sql` | `admin_set_listing_status` notifica al dueño (`listing_disabled`/`listing_enabled`). |
| `0033_admin_set_user_role.sql` | `admin_set_user_role` (solo superadmin): reemplaza todos los roles por uno. |
| `0034_libro_reclamaciones.sql` | Tabla `complaints` (Libro de Reclamaciones Indecopi), RLS solo staff; alta vía Edge Function `send-reclamo`. |

> ⚠️ Hay **dos** archivos con prefijo `0024` (`0024_admin_delete_user` y
> `0024_notifications_replica_identity`) y **dos** con prefijo `0029`
> (`0029_admin_listing_status_reason` y `0029_category_counts`); cada par es idempotente y el
> orden entre ellos no importa. El runner los aplica alfabéticamente.

---

## 12. Diagrama de relaciones (ER simplificado)

```
auth.users 1─1 profiles 1─* user_roles
profiles 1─* listings *─1 categories 1─* subcategories
listings 1─* listing_images / listing_documents / listing_events / reports
profiles *─* listings            (favorites)
listings 1─* conversations 1─* messages
listings 1─* job_applications
listings 1─* reviews             (reviewer/reviewee → profiles)
profiles 1─* saved_searches / notifications / notification_preferences / device_tokens
profiles 1─* orders 1─* order_listings *─1 listings
orders 1─1 invoices
role_permissions / system_settings / audit_logs   (panel admin)
complaints  (Libro de Reclamaciones; user_id → auth.users, nullable)
```

---

### Notas de seguridad
- Las RPC `admin_*` son `SECURITY DEFINER` pero **validan el rol internamente** (`is_staff` /
  `has_role 'superadmin'`), así que es seguro otorgarles `execute` a `authenticated`.
- Nunca expongas la `service_role key` en el frontend; solo se usa en Edge Functions.
- Si alguna credencial (contraseña de BD, service_role, tokens) se compartió en texto plano,
  **rótala** desde el dashboard.
```
