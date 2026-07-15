# 🛠️ Plan de implementación — eFFe Clasificados

> **15 de julio de 2026.** Plan paso a paso para cerrar todo lo que falta según [`CHECKLIST.md`](./CHECKLIST.md).
> Ordenado por fases (de menor a mayor riesgo/dependencia). Cada ítem indica los **archivos a tocar** y un **esfuerzo** aproximado (S = pequeño, M = medio, L = grande).
>
> **Todo lo que depende de terceros o de cargar llaves/certificados** (APNs de Apple, secrets, cuentas externas) está separado al final en **§ Pendientes externos** — no se puede resolver solo con código.

**Convención:** ✅ implementable ya en código · 🔑 el código queda listo pero se **activa** con algo externo (ver pendientes) · 🤔 requiere una decisión de negocio antes de codear.

---

## ✅ Estado (15-jul · 2.ª sesión) — verificado con typecheck + build + **497 tests**

| Fase | Estado |
|---|---|
| **0 · Limpieza de código muerto** | ✔ Hecho (buscador falso, Facebook, MapPage, APK, mock `integrations`) |
| **1 · Safe-areas iOS + teclado** | ✔ Hecho en código · falta QA en iPhone |
| **2 · Codemagic / config nativa iOS** | ✔ Hecho: env vars, parche de `Info.plist` (URL scheme + permisos), copia de Firebase e iconos (guardados), `@capacitor/ios` en deps · faltan los **valores/archivos externos** |
| **3 · Funcional** | ✔ Preferencias de notificación (UI + `notificationPrefs.ts`) · ✔ quitar boleta al publicar (+ migración `0062`) · el **badge móvil ya estaba cubierto** por la campanita del header (`Navbar.tsx:242`) |
| **5 · Pulido** | ✔ README real · ✔ code-splitting (bundle **1.1 MB → 411 KB**) · moderación **verificada**: ya usa la BD (`setListingStatus`); el `localStorage` solo respalda datos mock del modo demo |
| **4 · Push iOS (backend)** | ⛔ Pendiente: bloqueada por APNs (ver **Pendientes externos**) — no se toca `send-push` en vivo sin poder probarlo |

Lo que sigue abajo es el detalle de cada fase y, al final, **📌 Pendientes externos** (lo que depende de terceros/llaves y no se resuelve con código).

---

## Fase 0 — Limpieza de código muerto — ✔ **COMPLETADA (15-jul)**

Arranque limpio antes de construir encima.

1. **Borrar el buscador falso del seeker.** `SeekerSearch.tsx` es inalcanzable (nadie enlaza `/dashboard/buscador/buscar`; el seeker usa `/buscar`).
   - Eliminar `src/pages/seeker/SeekerSearch.tsx`.
   - Quitar el `lazy(...)` y la `<Route>` en `src/App.tsx:30` y `:96`.
   - Quitar el título en `src/components/DashboardLayout.tsx:23`.
2. **Borrar `MapPage.tsx` huérfano** (`/mapa` ya redirige a `/buscar?view=map`).
   - Eliminar `src/pages/MapPage.tsx` y su import/ruta en `App.tsx`.
3. **Facebook OAuth — ✔ decidido: NO se ofrece.** Quitado `signInWithFacebook` y la rama `"facebook"`; `signInWithGoogle` quedó directo. (La Fase 3.4 queda descartada.)
4. **Sacar el APK del repo.** `git rm --cached eFFe-v1.5-b6-debug.apk` y borrar el archivo; añadir `*.apk` a `.gitignore`.
5. **Aislar mocks de demo.** Confirmar que `src/data/adminMockData.ts` y `mockData.ts` solo se usan como fallback sin sesión; **eliminar el array `integrations`** (muerto, no se renderiza).

**Verificación Fase 0:** `npm run build` + `npm test` en verde; navegar el panel del seeker sin rutas rotas.

---

## Fase 1 — iOS: safe-areas y comportamiento nativo — ✔ **COMPLETADA en código (15-jul)** · falta QA en iPhone

La app dependía del padding nativo de Android; en iPhone el header quedaba bajo la Dynamic Island y la barra inferior bajo el home indicator. Todo esto es **CSS/código, sin dependencias externas.** Verificado: typecheck OK, build OK, `.pt-safe`/`.pb-safe` compilados al CSS, 414 tests en verde.

1. **Base de safe-areas (S).**
   - En `index.html` ya está `viewport-fit=cover` ✅.
   - En `src/index.css`, exponer variables globales y utilidades:
     ```css
     :root {
       --safe-top: env(safe-area-inset-top);
       --safe-bottom: env(safe-area-inset-bottom);
       --safe-left: env(safe-area-inset-left);
       --safe-right: env(safe-area-inset-right);
     }
     ```
   - (Android sigue funcionando: ahí los `env()` valen 0 porque `MainActivity` ya aplica el inset; conviene además **quitar el padding duplicado de Android** o dejar que iOS use `env()` y Android su inset nativo — validar que no se sumen.)
2. **Header superior (S).** Añadir `padding-top: var(--safe-top)` (o `pt-[env(safe-area-inset-top)]`) a:
   - `src/components/Navbar.tsx:77` (sticky top-0)
   - `src/components/AdminLayout.tsx:180`
3. **Barra inferior / bottom-nav (S).** Añadir `padding-bottom: var(--safe-bottom)` y ajustar la altura a:
   - `src/components/MobileBottomNav.tsx:60`
   - `src/components/AdminLayout.tsx:282`
4. **Contenedores a pantalla completa y modales (S).** Revisar drawers/hojas (BuyCreditsModal, sheets) para que el contenido inferior no quede bajo el home indicator.
5. **Teclado — evitar doble padding (S).** En `src/hooks/useKeyboardInset.ts`, con `resize:'native'` iOS ya reduce el WebView; condicionar el `kbPad` a Android (o al modo de resize) para no sumar padding dos veces. Afecta a `BuyCreditsModal.tsx` y `SettingsPage.tsx:192`.
6. **Gesto swipe-back (opcional, S).** Evaluar habilitar `allowsBackForwardNavigationGestures` del WKWebView (ajuste nativo/plugin) y/o garantizar botón "volver" visible en cada vista apilada.

**Verificación Fase 1:** probar en **iPhone con notch/Dynamic Island** (o simulador) que header, bottom-nav y teclado se ven correctos; confirmar que Android no se rompió.

---

## Fase 2 — iOS: build reproducible en Codemagic — ✔ **COMPLETADA en código (15-jul)** · faltan valores/archivos externos

**Problema de fondo:** `codemagic.yaml` hace `npx cap add ios` en cada build, así que **regenera `ios/` desde cero** y pierde toda config nativa. Solución: automatizar la inyección por script (implementable desde Windows) — o, alternativa, commitear la carpeta `ios/` (requiere un Mac una vez).

1. **Inyectar las env vars que faltan en el build (S) 🔑.** Añadir a `codemagic.yaml` (junto a `:17-18`):
   - `VITE_PUBLIC_SITE_URL` — sin ella `hostedPaymentUrl` (`payments.ts:99`) genera una URL relativa y el **pago Izipay se rompe** en el navegador del sistema.
   - `VITE_IZIPAY_PUBLIC_KEY`, `VITE_HCAPTCHA_SITE_KEY`.
   - *(Los **valores** se cargan en la UI de Codemagic → pendiente externo.)*
2. **Script post-`cap sync` que parchea `Info.plist` (M).** Nuevo paso en `codemagic.yaml` (corre en el runner Mac) usando `PlistBuddy`/`plutil` sobre `ios/App/App/Info.plist`:
   - **URL scheme del OAuth:** registrar `CFBundleURLTypes` con `com.effe.multiclasificados` (equivalente al `AndroidManifest.xml:27-32`). Sin esto `appUrlOpen` (`nativeInit.ts:21`) nunca dispara y el login social queda colgado.
   - **Permisos de fotos/cámara:** `NSCameraUsageDescription` y `NSPhotoLibraryUsageDescription` (el flujo de publicar sube imágenes).
   - Copiar el `GoogleService-Info.plist` al proyecto (el archivo lo aportas tú → pendiente externo).
3. **Iconos y splash de iOS (M) 🔑.** Añadir `@capacitor/assets` (dev dep) + un master `assets/icon.png` 1024×1024 con la marca; nuevo paso `npx capacitor-assets generate --ios` tras `cap sync`. Evita el **placeholder de Capacitor** (rechazo de App Store).
4. **Añadir `@capacitor/ios` a `package.json`** como dependencia (hoy se instala suelto en el workflow, `codemagic.yaml:23`).
5. **(Alternativa recomendada a mediano plazo)** generar y **commitear la carpeta `ios/`** una vez (con un Mac) para que la config nativa viva en git y no dependa de scripts. Requiere entorno macOS.

**Verificación Fase 2:** un build de Codemagic que produzca IPA con el ícono de marca, login con Google funcionando y pago Izipay abriendo la URL correcta en TestFlight.

---

## Fase 3 — Funcionalidades pendientes — ✔ **COMPLETADA (15-jul)**

1. **Preferencias de notificación — UI (M).** La tabla `notification_preferences` ya existe (`0014_notifications.sql`).
   - Añadir pestaña "Notificaciones" en `src/pages/shared/SettingsPage.tsx:199-203` (junto a Perfil/Seguridad).
   - Crear helper en `src/lib/` para leer/actualizar las preferencias (matriz evento × canal in-app/push/email).
   - UI con switches por evento y canal.
2. **Badge de notificaciones en el nav móvil (S).**
   - Crear `useUnreadNotifications` (espejo de `src/hooks/useUnreadMessages.ts`) reutilizando la lógica de `NotificationsBell.tsx`.
   - Mostrar el badge en `src/components/MobileBottomNav.tsx` (hoy solo hay badge de mensajes).
3. **Quitar el comprobante al publicar (S–M).** ✔ **Decisión tomada: la publicación NO emite boleta; solo se emite al comprar créditos/monedas.** Ajustar `finalizeListingPublication` (`src/lib/publish.ts:220-260`) para que al publicar **solo descuente saldo** (sin generar `invoice`/orden `paid`). Revisar que no rompa `AdvertiserInvoices` ni los tests de publicación.
4. ~~Facebook OAuth~~ — **descartado** (decisión: no se ofrece; código muerto ya eliminado en Fase 0).

**Verificación Fase 3:** tests nuevos para el helper de preferencias y el badge; revisión contable del flujo de comprobantes.

---

## Fase 4 — Push en iOS: enrutado en el backend 🔑 (M–L) — código listo, se activa con APNs

`src/lib/push.ts` ya es cross-platform y guarda `platform='ios'`. El trabajo es de **backend + configuración**:

1. **Decidir la vía de entrega (M).** En iOS, `@capacitor/push-notifications` entrega un **token APNs**, no FCM. Opciones:
   - **(A) Vía FCM (recomendada):** subir la clave APNs a Firebase y usar el **SDK de Firebase iOS** para obtener un token FCM; así `send-push` sigue enviando por FCM sin cambios. Requiere integración nativa iOS.
   - **(B) APNs directo:** que la Edge Function `send-push` envíe a APNs para `platform='ios'` (además de FCM para Android). Más código de backend, sin SDK nativo.
2. **Implementar la rama elegida (M)** en la Edge Function `send-push` (Supabase).
3. **Capabilities en Xcode/CI:** Push Notifications + Background Modes (Remote notifications) + entitlement `aps-environment` (automatizar en el script de Fase 2).

**Depende de:** clave APNs + `GoogleService-Info.plist` (ver pendientes externos). Sin eso no se puede probar en dispositivo.

---

## Fase 5 — Pulido y deuda técnica — ✔ **COMPLETADA (15-jul)**

1. **Moderación: `localStorage` → BD.** ✔ **Verificado: ya está bien.** `AdminListings.tsx` usa la BD (`setListingStatus` → RPC) para avisos reales (`isUuid(id)`); el `localStorage` (`effe_disabled`) **solo** respalda los datos mock del modo demo (ids no-UUID). No hay divergencia real que arreglar.
2. **README real (S).** ✔ Hecho: stack, setup, env vars, scripts, estructura, notas de móvil y enlaces a los docs de estado.
3. **Code-splitting (S).** ✔ Hecho: `manualChunks` en `vite.config.ts` (charts/maps/ui/supabase/router). El chunk principal bajó de **1.1 MB → 411 KB** y desapareció el warning de 500 KB.

---

## Orden recomendado de ejecución

```
Fase 0 (limpieza)  →  Fase 1 (safe-areas iOS)  →  Fase 3.1/3.2 (notificaciones)
      →  Fase 2 (Codemagic/Info.plist)  →  Fase 5 (pulido)
      →  Fase 4 (push iOS)  [cuando lleguen APNs + plist]
      →  Fase 3.3 (comprobante) y 3.4 (Facebook)  [tras decisiones de negocio]
```

**Ya ejecutado (15-jul):** Fases 0, 1, 2 (código), 3 y 5. Falta solo la **Fase 4 (push iOS)** y todo lo de **📌 Pendientes externos** (llaves, APNs, valores en Codemagic, archivos de Firebase/iconos).

---

# 📌 Pendientes externos (no se resuelven con código — requieren tu acción o de terceros)

Estos son los que mencionaste (tipo "APN de Apple"): dependen de cuentas, llaves, certificados o decisiones. El código de las fases de arriba queda **preparado** para cuando estén.

### 🍎 Apple / iOS
- [ ] **Clave APNs (.p8)** desde Apple Developer → subirla a **Firebase** (para push en iOS, Fase 4).
- [ ] **`GoogleService-Info.plist`** de la app iOS (descargar de Firebase, agregar app iOS al proyecto) → **commitearlo en `ios-config/GoogleService-Info.plist`**; el script de Codemagic ya lo copia si existe.
- [ ] **Master de ícono/splash 1024×1024** → **ponerlo en `assets/icon.png`**; el script de Codemagic ya corre `@capacitor/assets` si existe (sin él, sale el placeholder de Capacitor).
- [ ] Confirmar **provisioning profile / certificado de distribución / App Store Connect** (parecen ya configurados en `codemagic.yaml:7-13`: "eFFe Multiclasificados AppStore" + "Apple Distribution Certificate").
- [ ] (Si se opta por commitear `ios/`) acceso a un **Mac** una vez para generar la carpeta.

### 🔑 Llaves / secrets (cargar en su panel)
- [ ] **Izipay:** `IZIPAY_SHOP_ID`, `IZIPAY_PASSWORD`, `IZIPAY_HMAC_KEY` (secrets de Supabase) + `VITE_IZIPAY_PUBLIC_KEY` (build). Desde Back Office → Configuración › Tienda › Claves de API REST.
- [ ] **hCaptcha:** `VITE_HCAPTCHA_SITE_KEY` real (hoy usa la sitekey de prueba).
- [ ] **Resend:** `RESEND_API_KEY` (emails/reclamos).
- [ ] **`SUPABASE_SERVICE_ROLE_KEY`** en las Edge Functions que lo necesitan (`admin-reset-password`, `send-push`).
- [ ] **Valores de env vars en Codemagic** (Fase 2.1): `VITE_PUBLIC_SITE_URL`, `VITE_IZIPAY_PUBLIC_KEY`, `VITE_HCAPTCHA_SITE_KEY`, `VITE_SUPABASE_URL/ANON_KEY`.

### ⚙️ Configuración en paneles
- [ ] **Supabase Auth → Redirect URLs** del dominio de producción (para Google OAuth fuera de localhost).
- [ ] **Provider Facebook en Supabase** (solo si se decide ofrecer Facebook — Fase 3.4).
- [ ] **Rotar secretos comprometidos** (contraseña de BD, `service_role` key, tokens de GitHub que se compartieron por chat).

### 🤔 Decisiones de negocio
- [x] **¿Se ofrece login con Facebook?** → **NO.** Código muerto ya eliminado.
- [x] **¿La publicación emite comprobante?** → **NO**, solo la compra de créditos. Implementado (Fase 3.3 + migración `0062`).
- [ ] **¿Se activa OTA (Capgo)?** Hoy está desactivado; solo si querés actualizaciones sin pasar por la tienda.
