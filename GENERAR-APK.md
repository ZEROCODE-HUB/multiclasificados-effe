# Cómo generar el APK con Capacitor — eFFe Clasificados

Instructivo para compilar la app móvil (APK Android) a partir del mismo proyecto web (React + Vite).
Probado en **Windows 11** el 24-jun-2026.

---

## 1. Requisitos (qué se necesita)

| Herramienta | Versión usada | Para qué | Cómo verificar |
|---|---|---|---|
| **Node.js** | v25 (cualquiera ≥18) | Compilar la web | `node -v` |
| **JDK 21** | Microsoft OpenJDK 21 | Compilar el proyecto Android (**Capacitor 8 EXIGE JDK 21**, no 17) | `java -version` |
| **Android SDK** | platform-36, build-tools 36.0.0, platform-tools | Construir y firmar el APK | ver carpeta SDK |
| **Gradle** | 8.14.3 | Motor de compilación Android | viene con el wrapper |
| **Capacitor** | 8.4.1 | Puente web → app nativa | ya instalado en el proyecto |

> ⚠️ El error más común: usar **JDK 17** → falla con `invalid source release: 21`. Hay que usar **JDK 21**.

### Rutas usadas en esta PC (referencia)
```
JDK 21:        E:\SDKs\jdk-21
Android SDK:   E:\SDKs\android-sdk
Gradle:        E:\SDKs\gradle-8.14.3
```

---

## 2. Instalación por única vez (setup)

### 2.1 Instalar JDK 21
Descargar el **Microsoft Build of OpenJDK 21** (o Temurin 21) y descomprimir, por ejemplo en `E:\SDKs\jdk-21`.
- Microsoft: https://aka.ms/download-jdk/microsoft-jdk-21-windows-x64.zip

### 2.2 Instalar el Android SDK (sin Android Studio)
1. Descargar las **command-line tools**: https://developer.android.com/studio#command-tools
   (o directo: `https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip`)
2. Descomprimir en `E:\SDKs\android-sdk\cmdline-tools\latest\`
   (la estructura debe quedar: `...\cmdline-tools\latest\bin\sdkmanager.bat`)
3. Aceptar licencias e instalar los componentes:
   ```bash
   export JAVA_HOME="E:/SDKs/jdk-21"
   SM="E:/SDKs/android-sdk/cmdline-tools/latest/bin/sdkmanager.bat"
   yes | "$SM" --licenses --sdk_root="E:\SDKs\android-sdk"
   "$SM" --sdk_root="E:\SDKs\android-sdk" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
   ```

### 2.3 Instalar Gradle 8.14.3 (opcional si usas el wrapper)
Descargar https://services.gradle.org/distributions/gradle-8.14.3-bin.zip y descomprimir en `E:\SDKs\gradle-8.14.3`.
> Alternativa: usar `./gradlew` (el wrapper) que descarga Gradle solo. Aquí usamos Gradle directo porque la red era inestable.

### 2.4 Apuntar el proyecto al SDK
Crear el archivo `android/local.properties` con:
```
sdk.dir=E:/SDKs/android-sdk
```

---

## 3. Configuración de Capacitor (ya hecha en este proyecto)

Si fuera un proyecto nuevo, sería:
```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/app
npx cap init "eFFe Clasificados" "pe.effe.clasificados" --web-dir dist
npx cap add android
```

Archivo `capacitor.config.ts`:
```ts
const config: CapacitorConfig = {
  appId: 'pe.effe.clasificados',
  appName: 'eFFe Clasificados',
  webDir: 'dist'
};
```

> **Barra de estado:** se inicializa en `src/lib/nativeInit.ts` (llamado desde `main.tsx`) con
> `StatusBar.setOverlaysWebView({ overlay: false })` para que el contenido no quede debajo de la barra.

---

## 4. Generar el APK (cada vez que haya cambios)

Son 3 pasos: **build web → sync → compilar APK**.

```bash
# 1) Compilar la web y copiarla al proyecto Android
npm run build
npx cap sync android

# 2) Compilar el APK (debug) — desde la carpeta android/
cd android
export JAVA_HOME="E:/SDKs/jdk-21"
export ANDROID_HOME="E:/SDKs/android-sdk"
"E:/SDKs/gradle-8.14.3/bin/gradle" assembleDebug --no-daemon --console=plain
```

> En lugar del Gradle directo puedes usar el wrapper: `./gradlew assembleDebug`.
> Si ya descargaste todo antes, puedes añadir `--offline` para no depender de la red.

### Dónde queda el APK
```
android/app/build/outputs/apk/debug/app-debug.apk
```
Ese archivo es el que instalas en el teléfono.

---

## 5. Instalar en el teléfono (APK debug)
1. Pasa el `.apk` al celular (USB, WhatsApp, Drive…).
2. Ábrelo → permite *"Instalar apps de orígenes desconocidos"*.
3. Instala y abre la app.

> El **APK debug** sirve para PROBAR. **No** se sube a las tiendas tal cual.

---

## 6. Para publicar en las tiendas (release)

### Play Store (Android) — necesitas un AAB firmado
1. Crear un **keystore** (una sola vez):
   ```bash
   "E:/SDKs/jdk-21/bin/keytool" -genkey -v -keystore effe-release.keystore \
     -alias effe -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Configurar la firma en `android/app/build.gradle` (signingConfigs) o `key.properties`.
3. Compilar el bundle:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Genera `android/app/build/outputs/bundle/release/app-release.aab` → eso se sube a Google Play.
4. Necesitas una **cuenta de Google Play Console** (pago único ~US$25).

### App Store (iOS)
- Requiere **Mac** con **Xcode** + **cuenta Apple Developer** (US$99/año).
- Pasos: `npx cap add ios` → `npx cap sync ios` → abrir en Xcode (`npx cap open ios`) → Archive → subir.
- (En Windows no se puede compilar iOS; alternativa: servicios CI como Codemagic/EAS.)

---

## 7. Errores comunes y solución

| Error | Causa | Solución |
|---|---|---|
| `invalid source release: 21` | Estás usando JDK 17 | Usar **JDK 21** (set `JAVA_HOME`) |
| `SDK location not found` | Falta `android/local.properties` | Crear con `sdk.dir=...` |
| `Could not download ... Read timed out` | Red inestable | Reintentar; Gradle cachea lo bajado. Usar `--offline` cuando ya esté todo |
| `licenses not accepted` | Licencias del SDK | `yes \| sdkmanager --licenses` |
| El contenido tapa la barra de estado | Edge-to-edge de Android | Ya resuelto en `src/lib/nativeInit.ts` |

---

## Resumen ultra-rápido (cuando ya está todo instalado)
```bash
npm run build && npx cap sync android
cd android && JAVA_HOME="E:/SDKs/jdk-21" ANDROID_HOME="E:/SDKs/android-sdk" \
  "E:/SDKs/gradle-8.14.3/bin/gradle" assembleDebug --no-daemon --offline
# APK -> android/app/build/outputs/apk/debug/app-debug.apk
```
