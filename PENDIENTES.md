# Pendientes de desarrollo e implementación — Multiclasificados eFFe

> ⚠️ **DOCUMENTO HISTÓRICO / DESACTUALIZADO.** Reemplazado por [`CHECKLIST.md`](./CHECKLIST.md) (15-jul-2026).
> Varios pendientes de abajo ya están resueltos (pagos Izipay, mapa real, reportes a tabla real, hilo de moderación, Factiliza/boletas). Usar `CHECKLIST.md` como fuente de verdad.

> Estado al **23 de junio de 2026**. Branch de trabajo: `desarrollo`.
> El núcleo del marketplace ya está integrado con **Supabase** (auth, avisos, mensajería en tiempo real, reseñas, postulaciones, búsquedas guardadas, notificaciones y panel admin). Este documento lista lo que **falta** para considerar el sistema completo y productivo.

---

## 🟥 Crítico para producción (bloqueantes al desplegar)

### 1. Variables de entorno en el hosting
Al desplegar (Vercel / Netlify / etc.) hay que definir en el build:
- `VITE_SUPABASE_URL=https://prhbgniwymaaevnisyov.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<anon key>`

Sin esto, el frontend no conecta con Supabase. **(Solo configuración, no requiere código.)**

### 2. Configuración de URLs en Supabase Auth
En **Supabase → Authentication → URL Configuration**:
- **Site URL**: el dominio de producción (ej. `https://tudominio.com`).
- **Redirect URLs**: agregar `https://tudominio.com/auth/callback`.

Necesario para que el **login con Google** funcione fuera de localhost.

### 3. Desplegar la Edge Function de reseteo de contraseña
- `supabase functions deploy admin-reset-password`
- Configurar el secreto `SUPABASE_SERVICE_ROLE_KEY` en las variables de la función.
- Hasta hacerlo, el botón "Restablecer contraseña" del panel admin no opera realmente.

### 4. Rotar secretos comprometidos 🔐
Durante el desarrollo se compartieron por chat:
- Contraseña de la base de datos de Supabase (compartida durante el desarrollo; **rotar**).
- La `service_role` key.
- Tokens personales de GitHub.

**Acción:** rotar todos en sus respectivos paneles (Supabase → Database/API, GitHub → Settings → Tokens).

---

## 🟧 Pasarela de pago real (hoy simulada)

El flujo de **Publicar aviso** (`src/lib/publish.ts` + `AdvertiserPublish.tsx`) calcula precios con IGV, crea la orden, la boleta/factura y publica el aviso, **pero el pago no se cobra de verdad** (se asume aprobado).

Pendiente:
- Integrar una **pasarela peruana** (Culqi / Mercado Pago / Izipay).
- Crear **Edge Function de pago + webhook** que:
  - Recalcule el total en el servidor (no confiar en el precio del cliente).
  - Confirme el pago y recién entonces publique el aviso (`publish_listing`).
- Generar el **número de comprobante** de forma definitiva server-side.

---

## 🟨 Funcionalidades de frontend pendientes

### 5. Reportes/denuncias del detalle → tabla `reports`
- Hoy el botón "Reportar" en `ListingDetail.tsx` guarda en **localStorage** (`addReport` de `pricing.ts`).
- Falta conectarlo a la tabla real `reports` (ya existe el esquema polimórfico y RLS en `0015_reports_moderation.sql`) para que el panel de **moderación admin** los reciba.

### 6. Preferencias de notificación (canales push / email)
- La tabla `notification_preferences` y la matriz in-app/push/email ya existen en BD (`0014_notifications.sql`).
- La campanita in-app (`NotificationsBell.tsx`) ya funciona en tiempo real.
- **Falta:**
  - Pantalla de **Configuración → Notificaciones** para que el usuario elija qué eventos recibe y por qué canal.
  - **Edge Function** que consuma las notificaciones de canal `push`/`email` de la cola y las envíe (ej. con Resend para email / FCM para push).

### 7. Badge de notificaciones en el menú móvil inferior
- El badge de **mensajes** ya está en `MobileBottomNav.tsx`.
- Falta agregar el indicador de **notificaciones no leídas** en la versión móvil (en desktop ya está en el navbar).

### 8. Hilo real de mensajes en el panel admin
- `SuperConversations.tsx` (moderación) lista conversaciones, pero **no muestra el hilo real de mensajes** de cada una.
- Falta cargar los mensajes reales (con RLS de staff) para moderación.

### 9. Vista de mapa con datos reales
- En `SearchPage.tsx` la vista "Mapa" usa una **imagen de fondo demo** con pines en posiciones fijas (`PIN_POSITIONS`), no geolocalización real.
- Falta integrar un mapa real (Mapbox / Leaflet / Google Maps) usando `lat`/`lng` de los avisos y el **filtro por radio KM** (la función SQL `search_listings` ya soporta `lat/lng/radiusKm`).

### 10. Rating real en las tarjetas de avisos
- En Home y Buscador, `ListingCard.tsx` muestra rating **"0.0"** fijo.
- El rating real del vendedor ya se calcula en el detalle; falta exponerlo también en las tarjetas (vía `listing_cards.advertiser_rating`).

### 11. Filtro de ubicación en el buscador
- El campo "Ubicación" del panel de filtros (`SearchPage.tsx`) es visual: **no está conectado** al estado ni a la búsqueda.
- Falta cablearlo y, junto con el mapa, habilitar la búsqueda por cercanía.

### 12. Subcategorías en publicar/buscar
- El esquema soporta **subcategorías** (`0010_subcategories_search.sql`) y `search_listings` acepta `subcategory`.
- Falta UI para elegir subcategoría al publicar y para filtrar por ella en el buscador.

---

## 🟦 Mejoras de UX (no bloqueantes)

### 13. Evitar búsquedas guardadas duplicadas
- Al pulsar "Guardar búsqueda" se pueden crear entradas repetidas.
- Sugerido: validar si ya existe una con el mismo criterio y/o mostrar un diálogo de confirmación con el nombre editable.

### 14. Texto de búsqueda claramente opcional
- Aclarar en "Guardar búsqueda" que dejar el texto vacío genera alertas de **toda la categoría/precio** (el texto es un filtro literal por palabra).

### 15. Editar imágenes / categoría de un aviso
- El diálogo de edición en "Mis avisos" cubre título, descripción, precio, moneda y ubicación.
- Falta permitir **cambiar imágenes** (re-subida a Storage) y **categoría**.

### 16. Code-splitting del bundle
- El build advierte que el chunk principal supera 500 KB.
- Sugerido: `manualChunks` / `import()` dinámico para mejorar el tiempo de carga.

---

## 🟩 Dashboards y reportería con datos reales (verificar)

- **Estadísticas del anunciante** (`AdvertiserStats.tsx`): confirmar que todos los KPIs usan `listing_events` reales (vistas/clics/favoritos) y no mocks residuales.
- **Reportes comerciales admin** (`AdminReports.tsx` / `AdminCommercial.tsx`): revisar que las gráficas usen agregaciones reales.
- Asegurar que en **modo demo** (sin sesión Supabase) los mocks solo aparezcan ahí, y con sesión real se muestre el dato real aunque sea 0.

---

## 🧱 Infraestructura / despliegue pendiente

| Ítem | Acción |
|---|---|
| Migración admin `0023` | Ya aplicada en BD ✅ |
| Migraciones realtime `0022`/`0024` | Ya aplicadas y verificadas ✅ |
| Edge Function `admin-reset-password` | **Falta** `supabase functions deploy` |
| Edge Function pago + webhook | **Falta crear y desplegar** |
| Edge Function envío push/email | **Falta crear y desplegar** |
| Buckets de Storage | Verificar políticas en producción (`listing-images`, `listing-docs`, `avatars`) |
| Cron jobs (`pg_cron`) | `expire-listings` (30 min) y `saved-search-alerts` (15 min) activos ✅ |
| Dominio + HTTPS | Configurar al publicar |

---

## ✅ Ya implementado (referencia rápida)

- Auth real email/password + **Google OAuth**.
- Avisos: publicar, **editar, eliminar, pausar/reactivar** (datos reales del usuario).
- Buscador en vivo con filtros + **búsquedas guardadas con alertas** (cron).
- **Mensajería en tiempo real** con estados Enviado/Recibido/Leído + badge de no leídos.
- **Reseñas** y **postulaciones** (solo empleos; el dueño no se postula/reseña a sí mismo).
- **Notificaciones in-app** en tiempo real (campanita).
- **Favoritos** persistentes.
- **Panel admin/superadmin** con RBAC y control de acceso por rol.
- Migraciones SQL `0001–0024` aplicadas; RLS; vistas y RPCs de apoyo.

---

### Prioridad sugerida
1. **Crítico de producción** (env vars, Auth URLs, Edge Function reset, rotar secretos).
2. **Pasarela de pago real** (es lo que convierte el flujo de publicar en transaccional).
3. **Reportes a la tabla real** + **hilo de mensajes en moderación** (cierra el círculo de moderación).
4. **Mapa real + ubicación + rating en tarjetas** (mejoran descubrimiento).
5. **Preferencias de notificación + envío push/email**.
6. Mejoras de UX y code-splitting.
