# ✅ Checklist de auditoría — eFFe Clasificados

> **Última revisión: 26 de agosto de 2026.** Web v9.7 · App 2.8 (versionCode 19)
> · React 18 + Vite + TypeScript + Supabase + Capacitor 8.
>
> **Este es el único documento de estado del proyecto.** `PENDIENTES.md` se
> retiró el 25-ago-2026 (sigue en el historial de git). Que convivieran dos
> documentos contradictorios es el hallazgo H-15 de la auditoría externa, y no
> fue un problema cosmético: por leer un estado viejo, la auditoría clasificó el
> push de iOS como hallazgo **GRAVE** cuando llevaba semanas funcionando, y dio
> por pendientes siete credenciales que estaban cargadas.
>
> **La regla que sale de ahí:** un documento de estado desactualizado no es
> neutral — fabrica hallazgos falsos y hace perder días en desmentirlos. Si
> cierras algo, márcalo en el mismo commit; si revisas una sección contra el
> sistema real, escribe la fecha.

**Leyenda de severidad:** 🔴 Bloqueante · 🟠 Importante · 🟡 Menor · 🔑 Solo configuración (sin código)

---

## 0. Resumen ejecutivo

**El producto está funcionalmente completo.** Auth, avisos, buscador con mapa,
mensajería en tiempo real, favoritos, reseñas, postulaciones, moderación, panel
admin/superadmin con RBAC, créditos con pasarela Izipay, Yape/Plin, Factiliza
(DNI/RUC), boletas y facturas electrónicas, Libro de Reclamaciones.

Lo que queda **no es desarrollo pendiente**, son tres cosas de otra naturaleza:

| | Qué es | Dónde se resuelve |
|---|---|---|
| 🚨 **Dos cosas de configuración** | Restringir la llave de Google Maps (H-03) y dar de alta el RUC en Factiliza (H-10) | Paneles de Google Cloud y de Factiliza — no es código |
| 🔑 **El salto a producción** | Hoy `app_produccion = false`: todo cobro es de prueba y las boletas van a las series B066/F066 | Skill `pasar-a-produccion` |
| 📱 **El APK y el IPA** | Se dejan **para el final**, para que todas las correcciones entren en el binario que se sube a Play Store y TestFlight | Codemagic |

### Auditoría externa de agosto de 2026 (CORP LOZANOCHEFFER)

62 puntos revisados uno a uno contra el código real. Estado al 26-ago:

- **Corregido:** todo lo que era bug o corrección dentro del alcance.
- **Rebatido con pruebas (3):** H-04 (el push de iOS **no** está bloqueado; no
  hace falta `GoogleService-Info.plist` porque iOS va directo a Apple, no por
  Firebase), H-13 (Recharts **ya** estaba fuera del arranque — verificado en
  `dist/index.html`) y B-21 (los datos de tarjeta no pueden persistir: viven
  dentro del iframe de Lyra, fuera de nuestro alcance).
- **Fuera de alcance por decisión del cliente:** B-01, B-02 (2.ª mitad), B-07,
  B-08, B-09, B-10, B-18, B-25, H-18 (PWA).
- **Descartados tras evaluarlos:** H-07 (Playwright en CI: no hay más gente
  tocando el código), H-19 (política de seguridad: no puede promoverse porque
  no hay endpoint que recoja los reportes), H-13 (ver arriba).
- **Abiertos:** H-03 y H-10, arriba. H-14 (importaciones mixtas de Capacitor:
  no afecta a la app nativa, donde el bundle va dentro del binario).

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
- [x] 125 migraciones SQL (`0001`–`0124`), RLS, RPCs, cron jobs (`expire-listings`, `saved-search-alerts`, limpieza de adjuntos huérfanos)
- [x] 🚨 **Límite de tasa contra ráfagas y spam (H-06).** ✅ *Hecho (26-ago-2026, migración `0124`).* Triggers en `listings` y `messages` que frenan por usuario en ventanas de hora y día. **Va en la base de datos, no en una Edge Function**: publicar y enviar mensajes no pasan por ninguna, y un intermediario sería esquivable llamando a PostgREST directamente con la anon key, que es pública. No hay tabla de contadores: se cuenta sobre los propios avisos y mensajes, así que el contador no puede desincronizarse de la realidad. Topes calibrados sobre uso real medido (máximo observado por una persona: 10 avisos/hora, 28/día; 20 mensajes/hora, 28/día) y configurables en `system_settings.limites_de_tasa` sin desplegar — **poner un tope en 0 lo desactiva**, que es la válvula de escape si le corta la publicación a un cliente real. El personal queda exento. 18 pruebas en `migration0124.test.ts`.
- [ ] 🟠 **El registro no exige confirmar el correo** (`mailer_autoconfirm = true`): cualquiera crea cuentas con direcciones inventadas. Los topes de GoTrue (30 anónimos/hora) son la única barrera. ⚠️ **Activar el captcha nativo de Supabase Auth tumbaría el registro y el login**: el código solo manda token de captcha en el login de personal, así que habría que añadirlo antes en `AuthPage` — y en la app nativa hCaptcha está desactivado a propósito. No es un interruptor, es trabajo.

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
- [x] 🔴 **Push notifications en iOS (APNs).** ✅ *Hecho (verificado 25-ago-2026).* Esta línea decía "pendiente" desde julio y **por eso la auditoría externa de agosto lo clasificó como hallazgo GRAVE (H-04)**. No lo es, y conviene dejar claro qué se comprobó, capa por capa:
  - `send-push/index.ts` habla **directamente con Apple** (APNs con JWT firmado), sin pasar por Firebase. La rama iOS está escrita y solo se salta si faltan los secretos.
  - Los cinco secretos (`APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_ENV`) **están cargados** en Edge Functions.
  - `codemagic.yaml` tiene `IOS_PUSH: "true"`, escribe el entitlement `aps-environment = production`, lo engancha al proyecto Xcode y **comprueba después del build** que quedó puesto.
  - `push.ts` registra en cualquier plataforma nativa (`isNativePlatform()`), no solo Android.

  **El `GoogleService-Info.plist` NO hace falta**, y es donde se torció la auditoría: dio por supuesta la arquitectura habitual de FCM para las dos plataformas. Aquí Firebase es solo para Android; en iOS, `@capacitor/push-notifications` entrega un token de APNs y se manda a Apple sin intermediario.

  Lo único que queda es **probarlo en un iPhone de verdad**: que los secretos tengan los valores buenos y que la notificación llegue. Eso no se puede comprobar desde el repositorio.
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

## 4. 🔑 Configuración de producción (sin código)

> **Revisado el 26-ago-2026 contra el proyecto real** (Management API: `/secrets`, `/config/auth`, y `.env`).
> Las siete líneas de abajo estaban sin marcar desde julio **y las siete ya estaban puestas**. Es el mismo
> desfase que hizo que la auditoría externa clasificara APNs como hallazgo GRAVE (H-04) cuando llevaba
> semanas funcionando: un documento de estado que se queda atrás no es neutral, produce hallazgos falsos
> y hace perder días. **Si cambias una credencial, actualiza esta sección en el mismo commit.**

- [x] 🔑 **Izipay:** `IZIPAY_SHOP_ID`, `IZIPAY_PASSWORD`, `IZIPAY_HMAC_KEY`, `IZIPAY_PUBLIC_KEY` en Supabase y `VITE_IZIPAY_PUBLIC_KEY` en el `.env`. ✅ Cargados. ⚠️ **Siguen siendo las de PRUEBAS** (`96894874:testpublickey_…`): el cobro real es parte del salto a producción, no una credencial que falte.
- [x] 🔑 **hCaptcha:** `VITE_HCAPTCHA_SITE_KEY` real (`e0d418b8-…`, ya no la de prueba) + `HCAPTCHA_SECRET` en Supabase. ✅
- [x] 🔑 **Resend (emails/reclamos):** `RESEND_API_KEY`, `EMAIL_FROM`, `RECLAMOS_FROM`, `RECLAMOS_TO`, `INVOICE_EMAIL_FROM`. ✅ Verificado enviando correo real el 12-ago.
- [x] 🔑 **admin-reset-password:** `SUPABASE_SERVICE_ROLE_KEY` presente en los secrets de las Edge Functions. ✅ *(Ojo: está en el servidor, pero **nadie del equipo la tiene en claro** — la Management API solo devuelve resumen SHA-256. Para provisionar un superadmin hay que ir por SQL.)*
- [x] 🔑 **Google OAuth:** habilitado, y el `uri_allow_list` ya incluye `https://www.coleffe.com/**`, `https://coleffe.com/**`, el dominio de Vercel y los dos esquemas nativos (`pe.effe.clasificados://`, `com.effe.multiclasificados://`). ✅
- [x] 🔑 **Push/FCM + APNs:** `FCM_SERVICE_ACCOUNT` (Android) y `APNS_KEY_P8`/`APNS_KEY_ID`/`APNS_TEAM_ID`/`APNS_BUNDLE_ID`/`APNS_ENV` (iOS). ✅ Cargados. **Queda probarlo en un iPhone físico**, que es lo único que el simulador no puede decir.
- [ ] 🔑 **OTA (Capgo):** desactivado a propósito (`app_ota_url`/`app_ota_version` vacíos en `ota.ts`). **No lo enciendas antes de subir el APK nuevo**: la OTA vigente degradaría a 2.6 un APK recién instalado.

**Lo que sí queda por hacer en paneles ajenos:**

- [ ] 🚨 **Restringir la llave de Google Maps** (`VITE_GOOGLE_MAPS_API_KEY`) por referer/aplicación y por APIs. Es el H-03 de la auditoría y el único GRAVE que sigue abierto: hoy la llave viaja en el bundle **sin restricción**, y cualquiera puede gastarla contra la tarjeta del proyecto.
- [ ] 🚨 **Dar de alta el RUC 20616009061 en Factiliza.** Es el H-10, y ya no es teórico: **siete boletas B001 (000090–000096) rechazadas el 19-ago** con *"Su usuario no se encuentra configurado para el RUC"*. Mientras no se haga, cada emisión quema un correlativo sin emitir nada.
- [ ] 🔑 **Rotar el token personal de Supabase** (`sbp_4816…`), compartido por chat durante el desarrollo.

---

## 5. 🧹 Deuda técnica / limpieza

- [x] 🟡 **Borrar el buscador falso del seeker (código muerto).** ✅ *Hecho (15-jul).* Eliminado `SeekerSearch.tsx`, su import y título; la ruta `/dashboard/buscador/buscar` ahora **redirige** a `/buscar`.
- [x] 🟡 **Borrar el código muerto de Facebook OAuth.** ✅ *Hecho (15-jul).* **Decisión: no se ofrece Facebook.** Quitado `signInWithFacebook` y la rama `"facebook"`; `signInWithGoogle` quedó directo.
- [x] 🟡 **Borrar `MapPage.tsx` huérfano.** ✅ *Hecho (15-jul).* Archivo eliminado (`/mapa` ya redirige a `/buscar?view=map`).
- [x] 🟠 **Sacar el APK del repo.** ✅ *Hecho (15-jul).* `git rm --cached` del `.apk` (el `.gitignore` ya tenía `*.apk`).
- [x] 🟡 **Mocks de demo aislados.** ✅ *Cerrado (15-jul).* `featuredListings` era **código muerto** (nunca se importa; la Home usa `fetchListings` real). Los KPIs/serie del dashboard admin ahora se **guardan por sesión**: `fetchAdminStats`/`fetchGrowthSeries` (`admin.ts`) devuelven ceros/serie vacía **reales** para un staff logueado si el RPC viene vacío/falla, y el mock queda solo para el modo demo sin sesión. Test `adminStatsDemoGuard.test.ts`. **Rating falso quitado:** el "0.0" fijo de la lista del mapa (`SearchPage`) se eliminó. **Reseñas ocultas (por ahora):** el bloque `ListingReviews` del detalle (estaba solo para empleos) se desmontó; el componente y su lib siguen ahí para reactivarlo con un `{isJobs && ...}`. `loadReviewMeta` se mantiene porque también carga `ownerId`.
- [ ] 🟠 **Rotar secretos comprometidos.** el retirado `PENDIENTES.md` y `.env.example:3` mencionan que se compartieron por chat la contraseña de BD, la `service_role` key y tokens de GitHub. Rotar todos. *(Externo — ver `PLAN-IMPLEMENTACION.md`.)*
- [x] 🟡 **Moderación en `localStorage` — verificado, no es problema.** ✅ *Revisado (15-jul).* `AdminListings` usa la BD (`setListingStatus` → RPC) para avisos reales (`isUuid(id)`); el `effe_disabled` en `localStorage` **solo** respalda datos mock del modo demo. No diverge en producción.
- [x] 🟡 **Actualizar `README.md`.** ✅ *Hecho (15-jul).* Reescrito con stack, setup, env vars, scripts, estructura, móvil y enlaces a los docs de estado.
- [x] 🟡 **Code-splitting.** ✅ *Hecho (15-jul).* `manualChunks` en `vite.config.ts` (charts/maps/ui/supabase/router); chunk principal **1.1 MB → 411 KB**, sin warning de 500 KB.

---

## 5-bis. 🗄️ Migraciones

> **Revisado el 26-ago-2026.** Lo que decía antes esta sección era falso:
> daba por pendiente `0080_search_priority_by_zone.sql`, que **ya no existe**
> (se borró al cambiar cercanía por departamento), y `0081`, que está aplicada.

**125 migraciones en el repo, la última es `0124_limite_de_tasa.sql`.**

⚠️ **No hay tabla de control de migraciones** (`supabase_migrations.schema_migrations`
no existe en este proyecto): se aplican a mano por la Management API. Eso
significa que **nada avisa si una se queda sin aplicar** — el código suele
degradar limpio y el fallo aparece semanas después como "esa pantalla sale
vacía". Al aplicar una, compruébalo consultando el objeto que crea.

Verificado presente en producción el 26-ago: `0120` (avisos por país), `0122`
(adjuntos huérfanos), `0123` (transacciones con modo de pago) y `0124` (límite
de tasa, con sus dos triggers activos).

**La trampa de la 0104:** desde esa migración, una función nueva nace **sin**
EXECUTE para `anon`/`authenticated`. Si te olvidas del `grant`, el fallo es un
`42501` silencioso en producción y la pantalla sale vacía sin decir por qué. Ya
pasó una vez y dejó el buscador a cero. Y ojo: `create or replace` conserva los
permisos, pero **cambiar el tipo de retorno obliga a DROP + CREATE, y eso los
pierde** — hay que volver a concederlos en la misma migración.

## 6. 🎯 Qué queda (al 26-ago-2026)

**De código, nada dentro del alcance.** Lo que falta, por orden de urgencia:

1. 🚨 **Dar de alta el RUC 20616009061 en Factiliza** (H-10). Hasta que no esté,
   `app_produccion` no se puede encender: cada emisión real será rechazada. Ver
   la nota sobre la serie B001 más abajo.
2. 🚨 **Restringir la llave de Google Maps** (H-03) por referer y por API.
3. 🔑 **Rotar el token personal de Supabase** compartido por chat (H-02).
4. 📱 **Probar el push en un iPhone físico.** Es lo único que el simulador no
   puede responder; todo lo demás de APNs está verificado (§3).
5. 🖼️ **El icono maestro** `assets/icon.png` de 1024×1024 para iOS.
6. 🚀 **El salto a producción** (skill `pasar-a-produccion`) y, al final del
   todo, **el APK y el IPA**.

### La serie B001 y los siete rechazos del 19-ago

Conviene dejarlo escrito, porque a simple vista asusta más de lo que es.

La serie de producción `B001` llegó al correlativo 96 sin haber emitido nunca
nada ante SUNAT:

- **19–89 (62 comprobantes): estado `omitido`.** Se generaron cuando la emisión
  electrónica no estaba configurada. No se enviaron, **no tienen PDF y no se
  mandaron por correo**: nunca llegaron a manos de ningún cliente.
- **90–96 (7 comprobantes): estado `rechazado`,** el 19-ago entre las 12:46 y
  las 17:17, todos con *"Su usuario no se encuentra configurado para el RUC
  '20616009061'"*. Fue la tarde en que se probó el modo producción antes de
  tener el RUC de alta.

**Ninguno llegó a SUNAT.** El rechazo es de Factiliza (HTTP 400, su propia
validación): los siete están sin `sunat_hash`, sin CDR y sin `sunat_sent_at`, o
sea que nunca se firmaron ni se enviaron. Para SUNAT esos números **no existen**
y no hay nada declarado que corregir.

**Ahora mismo no se está quemando numeración:** con `app_produccion = false`
todo va por la serie de pruebas `B066`, y desde el 24-ago todas se aceptan.

**Al saltar a producción hay que decidir la serie**, y es una decisión para
consultar con el contador. La opción limpia es **abrir una serie nueva (`B002`)
empezando en 1**, en vez de continuar `B001` desde el 97: así la serie declarada
no arrastra 96 números que para SUNAT nunca existieron. Continuar en `B001-000097`
también es válido —SUNAT no exige empezar en 1— pero deja una serie con un hueco
inicial que habría que saber explicar en una fiscalización.

---

