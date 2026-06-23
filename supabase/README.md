# Supabase — eFFe Multiclasificados

Backend del marketplace de clasificados: Postgres + Auth + Storage + Realtime, con RLS por rol.

## Cómo aplicar las migraciones

Las migraciones están en `supabase/migrations/` y se aplican **en orden numérico**.

### Opción A — Script Node incluido (recomendado aquí)
```bash
# desde la raíz del proyecto
node supabase/run-migrations.mjs "<CONNECTION_STRING>"
```
Ejecuta los 8 archivos `.sql` en orden, cada uno dentro de una transacción.

### Opción B — SQL Editor del dashboard
Copia y pega el contenido de cada archivo `0001` … `0008` en el SQL Editor de Supabase, en orden, y ejecútalos.

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
```
