# ✅ Checklist de auditoría — eFFe Clasificados

> **Estado al 15 de julio de 2026** · App v2.6 (versionCode 17) · Stack: React 18 + Vite + TypeScript + Supabase + Capacitor.
> Documento vivo: marcá `[x]` a medida que se cierra cada ítem.
> Este archivo **reemplaza** a `PENDIENTES.md` (fechado 23-jun-2026 y desactualizado: pagos, mapa real, reportes a tabla real, hilo de moderación y Factiliza/boletas ya están hechos).

**Leyenda de severidad:** 🔴 Bloqueante · 🟠 Importante · 🟡 Menor · 🔑 Solo configuración (sin código)

---

## 0. Resumen ejecutivo

- El **núcleo del marketplace está completo y funcionando**: auth, avisos, buscador real con mapa, mensajería en tiempo real, favoritos, reseñas, postulaciones, moderación, panel admin/superadmin con RBAC, créditos + pasarela Izipay cableada, Factiliza (DNI/RUC), boletas.
- Lo que falta se divide en tres frentes:
  1. **Un puñado de funcionalidades a medias** (sobre todo una pantalla de búsqueda prototipo y preferencias de notificación).
  2. **Configuración de producción** (llaves/secrets que aún no se cargan: Izipay, hCaptcha real, Resend, FCM…).
  3. **Preparación para iPhone/iOS** — el frente con más trabajo real: hay pipeline de build iOS, pero faltan safe-areas, URL scheme, push APNs, iconos y persistir la config nativa. Detalle en §5.

---

## 1. ✅ Hecho (verificado en código)

### Público / auth
- [x] Landing con estadísticas reales (`fetchPlatformStats`, conteos por categoría) — `src/pages/Index.tsx`
- [x] Buscador público real con filtros (texto, categoría, precio, orden), paginación y **filtro de ubicación cableado** — `src/pages/SearchPage.tsx`
- [x] **Vista de mapa Leaflet real** (OpenStreetMap + clustering + geocoding Nominatim) — `src/components/ListingsMap.tsx`, `src/lib/geocode.ts`
- [x] Detalle de aviso: galería, reseñas, contacto/mensaje, postulación a empleos — `src/pages/ListingDetail.tsx`
- [x] Login/registro email+password + **Google OAuth**; `/auth/staff` con hCaptcha — `src/pages/AuthPage.tsx`

### Buscador (seeker)
- [x] Dashboard real (búsquedas guardadas + favoritos) — `src/pages/SeekerDashboard.tsx`
- [x] Favoritos persistentes — `src/pages/seeker/SeekerFavorites.tsx`, `src/lib/favorites.ts`
- [x] Búsquedas guardadas con alertas por cron — `src/pages/seeker/SeekerSearches.tsx`

### Anunciante (advertiser)
- [x] Publicar aviso con **modelo de créditos**, verificación DNI/RUC (Factiliza), promos por volumen, borradores, adicionales (urgente/confidencial) — `src/pages/advertiser/AdvertiserPublish.tsx`
- [x] Mis avisos: editar (título, desc, precio, moneda, ubicación, **reemplazo de foto principal**), pausar/reactivar, eliminar — `src/pages/advertiser/AdvertiserListings.tsx`
- [x] Postulaciones recibidas con CV firmado — `src/pages/advertiser/AdvertiserApplications.tsx`
- [x] Estadísticas reales (RPC `advertiser_stats`) — `src/pages/advertiser/AdvertiserStats.tsx`
- [x] Boletas/facturas reales — `src/pages/advertiser/AdvertiserInvoices.tsx`

### Admin / superadmin (RBAC)
- [x] Dashboard con KPIs y series reales — `src/pages/admin/AdminDashboard.tsx`
- [x] Moderación de avisos (aprobar/rechazar/deshabilitar con motivo) — `src/pages/admin/AdminListings.tsx`
- [x] Gestión de usuarios, otorgar créditos, restablecer contraseña — `src/pages/admin/AdminUsers.tsx`
- [x] Comunicaciones (individuales + broadcast) — `src/pages/admin/AdminCommunications.tsx`
- [x] Moderación de reportes **con hilo real de mensajes** — `src/pages/superadmin/SuperConversations.tsx`
- [x] Comercial (categorías drag&drop), reportería real, tarifas/promos/paquetes — `AdminCommercial.tsx`, `AdminReports.tsx`, `AdminPricing.tsx`
- [x] Matriz de permisos por rol **rediseñada, clara y con efecto real** — `src/pages/superadmin/SuperRoles.tsx`. ✅ *Rehecho (15-jul).* Catálogo único `src/lib/permissions.ts` (fuente de verdad de matriz + menú), modelo de dos niveles (sin casillas fantasma: cada toggle tiene enforce real), etiquetas en verbo + descripción "qué desbloquea", resumen en vivo por rol. Cableado UI↔servidor corregido: "Verificar" bajo `approve` (`AdminUsers.tsx`), botones de Reclamos gateados por `edit` (`SuperConversations.tsx`), y `admin_delete_user` ahora honra la casilla `delete` (`0063`). Tests `permissionsCatalog.test.ts` + `migration0063.test.ts`.
- [x] **Enforcement completo de la matriz (sin huecos)** ✅ *(15-jul).* Se cerraron 3 huecos detectados en auditoría: **(A)** `admin_set_listing_status` (3 args) seguía en `is_staff`, así que deshabilitar/rehabilitar avisos no respetaba "Moderar" → `0064` lo pasa a `has_perm('Gestión de avisos','edit')`. **(B)** "Ver sin editar" real en Comercial/Tarifas/Comunicaciones → `0065` cablea su escritura (RLS de categorías/subcategorías/tarifas/promos/paquetes + RPCs `admin_send_message`/`admin_broadcast`) a `has_perm(módulo,'edit')`; el catálogo suma la acción `edit` y las 3 pantallas gatean sus botones. **(C)** `admin_grant_credits` vivía solo en la BD remota → `0066` lo trae al repo y alinea su guard a `has_perm('Gestión de usuarios','edit')`. Tests `migration0064/0065/0066.test.ts`. **Nota de despliegue:** moderador/soporte dejan de poder editar Comercial/Tarifas/Comunicaciones (antes podían por el hueco `is_staff`); el superadmin puede reactivarlo con el toggle por rol. Las variables del sistema (comisión/mantenimiento) siguen siendo superadmin-only a propósito.
- [x] Auditoría (`audit_logs`) con filtros, paginación y export CSV — `src/pages/superadmin/SuperAudit.tsx`

### Transversal / integraciones
- [x] Mensajería en tiempo real (Enviado/Recibido/Leído + badge no leídos)
- [x] Reportes/denuncias a tabla real `reports` — `src/lib/reports.ts`
- [x] Notificaciones in-app en tiempo real (campanita)
- [x] **Pasarela Izipay/Lyra cableada** (Edge Functions `create-payment` + `payment-webhook`, RPC idempotente `settle_paid_order`, form embebido/redirect) — *requiere llaves, ver §4*
- [x] Factiliza DNI/RUC — `verify-doc` + `src/lib/verifyDoc.ts`
- [x] Libro de Reclamaciones — Edge Function `send-reclamo`
- [x] 60+ migraciones SQL (`0001`–`0061`), RLS, RPCs, cron jobs (`expire-listings`, `saved-search-alerts`)

---

## 2. 🔧 Falta — Funcional (requiere código)

- [x] 🟡 **Preferencias de notificación (canal push/email).** ✅ *Hecho (15-jul).* Nueva pestaña "Notificaciones" en `SettingsPage.tsx` + helper `src/lib/notificationPrefs.ts` (matriz evento × canal in-app/push/email, upsert a `notification_preferences`). Con test `notificationPrefs.test.ts`.
- [x] 🟡 **Badge de notificaciones no leídas en el nav móvil.** ✅ *Ya estaba cubierto.* La campanita (`NotificationsBell`, con su badge) se renderiza en la cabecera móvil `sticky` (`Navbar.tsx:242-246`), siempre visible. Un badge extra en la barra inferior sería redundante.
- [x] 🟡 **Doble comprobante — resuelto.** ✅ *Hecho (15-jul).* **Decisión: publicar NO emite boleta**, solo la compra de créditos. `finalizeListingPublication` ya no crea orden/`invoice` (solo descuenta saldo con `spendCredits`); migración `0062` reatribuye el ingreso por aviso desde `credit_transactions`. UI y tests actualizados.

> **Nota (revisado 15-jul):** dos ítems que parecían "a medias" resultaron ser **código muerto inalcanzable**, así que pasaron a §5 Limpieza, no a implementar:
> - `SeekerSearch.tsx` (`/dashboard/buscador/buscar`): la ruta **no está enlazada en ningún menú**; el botón "Explorar" del seeker va a `/buscar` (el buscador real). Se borra.
> - Botón de Facebook: **no existe en la UI** (ambos botones sociales son "Google"); `signInWithFacebook` en `auth.ts:307` es código muerto. Se borra (o se implementa Facebook de verdad si se decide ofrecerlo).

---

## 3. 📱 iPhone / iOS — Preparación

> **Contexto crítico:** existe un pipeline de build iOS (`codemagic.yaml` → TestFlight), pero **no hay carpeta `ios/` versionada**: se regenera en cada build con `npx cap add ios` (`codemagic.yaml:26-27`). Por eso **toda configuración nativa que no esté commiteada o automatizada por script se pierde en cada compilación.** Esto amplifica casi todos los puntos de abajo.

### 🔴 Bloqueantes
- [x] 🔴 **Safe areas / notch / Dynamic Island.** ✅ *Hecho (15-jul).* Utilidades `.pt-safe`/`.pb-safe` (`env(safe-area-inset-*)`) en `index.css`, aplicadas a los headers (`Navbar.tsx`, `AdminLayout.tsx`) y a las barras inferiores (`MobileBottomNav.tsx`, `AdminLayout.tsx`). En Android valen 0 (MainActivity ya aplica y **consume** los insets → sin duplicar). **Pendiente:** validar en un iPhone real con Dynamic Island.
- [x] 🔴 **URL scheme para OAuth en `Info.plist`.** ✅ *Hecho (15-jul).* El paso "Configure iOS" de `codemagic.yaml` inyecta `CFBundleURLTypes` con `com.effe.multiclasificados` vía `PlistBuddy` tras `cap sync` (equivalente al `AndroidManifest.xml`).
- [x] 🔴 **Variables de entorno del build iOS.** ✅ *Hecho en código (15-jul).* `codemagic.yaml` ahora declara `VITE_PUBLIC_SITE_URL`, `VITE_IZIPAY_PUBLIC_KEY` y `VITE_HCAPTCHA_SITE_KEY`. **Falta 🔑 cargar los VALORES** en Codemagic (ver §4).
- [ ] 🔴 **Push notifications en iOS (APNs).** ⛔ *Pendiente por dependencia externa.* `push.ts` es cross-platform y el `codemagic.yaml` ya copia `GoogleService-Info.plist` si está en `ios-config/`. Falta: la **clave APNs** subida a Firebase, las capabilities Push/Background Modes + entitlement `aps-environment`, y decidir en `send-push` el envío a tokens iOS (APNs vs FCM). Requiere la clave de Apple (ver §Pendientes externos del PLAN).
- [x] 🔴 **Persistir/automatizar la config nativa iOS.** ✅ *Hecho (15-jul).* En vez de commitear `ios/`, el paso "Configure iOS" de `codemagic.yaml` **reinyecta** URL scheme, usage strings, Firebase e iconos tras `cap add/sync`, así no se pierden entre builds. `@capacitor/ios` quedó en `package.json` (lo instala `npm ci`).

### 🟠 Importantes
- [x] 🟠 **Iconos y splash de iOS.** ✅ *Automatizado (15-jul).* El `codemagic.yaml` corre `@capacitor/assets generate --ios` si existe `assets/icon.png`. **Falta 🔑 el master 1024×1024** en `assets/icon.png` (ver §Pendientes externos); sin él sale el placeholder de Capacitor.
- [x] 🟠 **Usage strings de cámara/fotos en `Info.plist`.** ✅ *Hecho (15-jul).* El paso "Configure iOS" añade `NSCameraUsageDescription` y `NSPhotoLibraryUsageDescription`.

### 🟡 Menores / QA en dispositivo
- [x] 🟡 **Teclado: posible doble compensación.** ✅ *Hecho (15-jul).* `useKeyboardInset.ts` ahora aplica el `kbPad` **solo en Android** (`getPlatform() === "android"`); en iOS el `resize:'native'` ya reduce el WebView. Android queda idéntico. Validar en iPhone. (`resizeOnFullScreen` de `capacitor.config.ts` es Android-only, inofensivo en iOS.)
- [x] 🟡 **Gesto "swipe-back".** ✅ *Hecho (15-jul).* Como es una SPA y `ios/` se regenera en cada build, en vez de tocar config nativa se añadió un gesto **JS portable**: `IosSwipeBack.tsx` (montado en `App.tsx` dentro del Router) detecta un arrastre horizontal desde el borde izquierdo (solo `getPlatform()==='ios'`) y hace `navigate(-1)`. Android conserva su back de sistema; en web no aplica. Test `iosSwipeBack.test.tsx`. **Validar en iPhone** el tacto real.

### ✅ Sin problemas para iOS (verificado)
- [x] **Detección de plataforma limpia:** no hay ningún `=== 'android'` que excluya a iOS; todo el gating usa `Capacitor.isNativePlatform()`. `getPlatform()` solo etiqueta el token push y devolverá `'ios'` correctamente.
- [x] **Sin listeners de botón físico de atrás** (`backButton`/`hardwareBackPress`) que asuman hardware Android.
- [x] El **pago Izipay usa polling** (no deep link), así que el mecanismo es portable a iOS tal cual (una vez resueltas las env vars del punto bloqueante).

---

## 4. 🔑 Falta — Configuración de producción (sin código)

- [ ] 🔑 **Izipay (cobro real):** cargar secrets `IZIPAY_SHOP_ID`, `IZIPAY_PASSWORD`, `IZIPAY_HMAC_KEY` (Supabase) y `VITE_IZIPAY_PUBLIC_KEY` (`.env`), desde Back Office → Configuración › Tienda › Claves de API REST. Hasta entonces el modal muestra "Pasarela no configurada".
- [ ] 🔑 **hCaptcha:** poner `VITE_HCAPTCHA_SITE_KEY` real (hoy cae a la sitekey de prueba `10000000-ffff-…` en `AuthPage.tsx:9`).
- [ ] 🔑 **Resend (emails/reclamos):** `RESEND_API_KEY`. Sin él, los reclamos se guardan pero no se envía el correo (`send-reclamo/index.ts:156`).
- [ ] 🔑 **admin-reset-password:** `SUPABASE_SERVICE_ROLE_KEY` en la Edge Function.
- [ ] 🔑 **Google OAuth:** Redirect URLs del dominio de producción en Supabase → Authentication → URL Configuration.
- [ ] 🔑 **Push/FCM:** credenciales FCM en producción (además de APNs para iOS, ver §3).
- [ ] 🔑 **OTA (Capgo):** desactivado por defecto (`app_ota_url`/`app_ota_version` vacíos en `ota.ts`). Publicar bundle y fijar variables solo si se desea.

---

## 5. 🧹 Deuda técnica / limpieza

- [x] 🟡 **Borrar el buscador falso del seeker (código muerto).** ✅ *Hecho (15-jul).* Eliminado `SeekerSearch.tsx`, su import y título; la ruta `/dashboard/buscador/buscar` ahora **redirige** a `/buscar`.
- [x] 🟡 **Borrar el código muerto de Facebook OAuth.** ✅ *Hecho (15-jul).* **Decisión: no se ofrece Facebook.** Quitado `signInWithFacebook` y la rama `"facebook"`; `signInWithGoogle` quedó directo.
- [x] 🟡 **Borrar `MapPage.tsx` huérfano.** ✅ *Hecho (15-jul).* Archivo eliminado (`/mapa` ya redirige a `/buscar?view=map`).
- [x] 🟠 **Sacar el APK del repo.** ✅ *Hecho (15-jul).* `git rm --cached` del `.apk` (el `.gitignore` ya tenía `*.apk`).
- [x] 🟡 **Mocks de demo aislados.** ✅ *Cerrado (15-jul).* `featuredListings` era **código muerto** (nunca se importa; la Home usa `fetchListings` real). Los KPIs/serie del dashboard admin ahora se **guardan por sesión**: `fetchAdminStats`/`fetchGrowthSeries` (`admin.ts`) devuelven ceros/serie vacía **reales** para un staff logueado si el RPC viene vacío/falla, y el mock queda solo para el modo demo sin sesión. Test `adminStatsDemoGuard.test.ts`. **Rating falso quitado:** el "0.0" fijo de la lista del mapa (`SearchPage`) se eliminó. **Reseñas ocultas (por ahora):** el bloque `ListingReviews` del detalle (estaba solo para empleos) se desmontó; el componente y su lib siguen ahí para reactivarlo con un `{isJobs && ...}`. `loadReviewMeta` se mantiene porque también carga `ownerId`.
- [ ] 🟠 **Rotar secretos comprometidos.** `PENDIENTES.md:29-35` y `.env.example:3` mencionan que se compartieron por chat la contraseña de BD, la `service_role` key y tokens de GitHub. Rotar todos. *(Externo — ver `PLAN-IMPLEMENTACION.md`.)*
- [x] 🟡 **Moderación en `localStorage` — verificado, no es problema.** ✅ *Revisado (15-jul).* `AdminListings` usa la BD (`setListingStatus` → RPC) para avisos reales (`isUuid(id)`); el `effe_disabled` en `localStorage` **solo** respalda datos mock del modo demo. No diverge en producción.
- [x] 🟡 **Actualizar `README.md`.** ✅ *Hecho (15-jul).* Reescrito con stack, setup, env vars, scripts, estructura, móvil y enlaces a los docs de estado.
- [x] 🟡 **Code-splitting.** ✅ *Hecho (15-jul).* `manualChunks` en `vite.config.ts` (charts/maps/ui/supabase/router); chunk principal **1.1 MB → 411 KB**, sin warning de 500 KB.

---

## 6. 🎯 Qué queda (al 15-jul, tras la 2.ª sesión)

Casi todo el trabajo **de código** está hecho (Fases 0, 1, 2, 3 y 5 del plan — ver detalle en cada sección). Lo pendiente es:

1. **QA en un iPhone real** de las safe-areas y el teclado (código listo, falta verlo en pantalla).
2. **Config de producción (§4):** cargar las llaves (Izipay, hCaptcha, Resend, service_role) y los **valores** de las env vars en Codemagic.
3. **Push en iOS (§3 🔴):** requiere la **clave APNs** de Apple + `GoogleService-Info.plist` en `ios-config/` + trabajo de backend en `send-push`.
4. **Assets iOS:** poner el master `assets/icon.png` 1024×1024.
5. **Rotar los secretos comprometidos** (§5).

> 📋 El plan por fases y los **pendientes externos** (llaves, APNs, valores en Codemagic) están en [`PLAN-IMPLEMENTACION.md`](./PLAN-IMPLEMENTACION.md).
