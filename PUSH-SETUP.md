# Notificaciones push en el APK (FCM) — pasos para activarlas

El **código ya está listo** (tabla `device_tokens`, registro de token en la app,
Edge Function `send-push`). Falta la configuración de **Firebase** (requiere tu
cuenta Google) y el despliegue. Sigue estos pasos en orden.

---

## Paso 1 — Crear el proyecto en Firebase (tú)
1. Entra a https://console.firebase.google.com → **Agregar proyecto** (o usa uno existente).
2. Dentro del proyecto → **Agregar app** → ícono **Android**.
3. **Nombre del paquete (package name):** `pe.effe.clasificados` (exacto).
4. Descarga el archivo **`google-services.json`**.
5. Colócalo en: `android/app/google-services.json`

## Paso 2 — Clave de servidor para enviar push (tú)
1. En Firebase → ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. **Generar nueva clave privada** → descarga el JSON (es la cuenta de servicio).
   ⚠️ Guárdalo en un lugar seguro, **no** lo subas a git.

## Paso 3 — Configurar Gradle (lo hago yo cuando tengas el `google-services.json`)
Se agrega el plugin de Google Services a:
- `android/build.gradle` → `classpath 'com.google.gms:google-services:4.4.2'`
- `android/app/build.gradle` → `apply plugin: 'com.google.gms.google-services'`
> Sin `google-services.json` el build de Android falla, por eso este paso va después del Paso 1.

## Paso 4 — Desplegar la Edge Function (tú, con Supabase CLI)
```bash
# Instalar el CLI si no lo tienes:  npm i -g supabase
supabase login
supabase link --project-ref prhbgniwymaaevnisyov

# Subir la función
supabase functions deploy send-push

# Cargar el secreto con la cuenta de servicio (el JSON del Paso 2)
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat ruta/al/service-account.json)"
```
> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los provee Supabase a la función.

## Paso 5 — Conectar el evento (Database Webhook)
En el panel de Supabase:
1. **Database → Webhooks → Create a new hook**.
2. Tabla: **`notifications`**, evento: **Insert**.
3. Tipo: **HTTP Request → POST** a la URL de la función:
   `https://prhbgniwymaaevnisyov.functions.supabase.co/send-push`
4. Header opcional de autorización si lo pide (Bearer del anon/service).

Con esto: cada vez que se crea una notificación (ej. **nuevo mensaje**), el webhook
llama a `send-push`, que busca los dispositivos del usuario y envía el push por FCM.

## Paso 6 — Recompilar el APK (yo)
Con `google-services.json` ya en `android/app/`:
```bash
npm run build && npx cap sync android
cd android && JAVA_HOME="E:/SDKs/jdk-21" ANDROID_HOME="E:/SDKs/android-sdk" \
  "E:/SDKs/gradle-8.14.3/bin/gradle" assembleDebug --no-daemon
```

---

## Cómo se prueba
1. Instala el APK nuevo en el teléfono e inicia sesión.
2. El APK pide permiso de notificaciones → **Permitir**.
3. Desde **otra cuenta**, envíale un mensaje.
4. El teléfono recibe la notificación push **aunque la app esté cerrada**. 🎉

---

## Qué ya está hecho en el código
- `supabase/migrations/0025_device_tokens.sql` — tabla de tokens + RPC `register_device_token` (aplicada ✅).
- `src/lib/push.ts` — pide permiso, obtiene el token FCM y lo guarda en Supabase.
- `src/lib/nativeInit.ts` — llama a `initPush()` al abrir el APK.
- `src/components/SupabaseAuthBridge.tsx` — asocia el token al usuario tras login.
- `supabase/functions/send-push/index.ts` — envía el push vía FCM HTTP v1.

## Resumen de lo que falta (tu acción)
| Paso | Quién |
|---|---|
| Crear proyecto Firebase + `google-services.json` | **Tú** |
| Descargar cuenta de servicio (JSON) | **Tú** |
| Configurar Gradle con el plugin | Yo (cuando tengas el json) |
| `supabase functions deploy send-push` + secret | **Tú** (o juntos) |
| Crear el Database Webhook | **Tú** (en el panel) |
| Recompilar APK | Yo |
