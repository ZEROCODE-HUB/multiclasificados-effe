# eFFe Clasificados

Marketplace de avisos clasificados para Perú: publicación de avisos con modelo de
**créditos prepagados**, verificación de identidad (DNI/RUC vía Factiliza), pasarela
de pagos **Izipay/Lyra**, mensajería en tiempo real, panel de administración con
control de acceso por rol y app móvil (Android hoy; iOS en preparación) vía Capacitor.

## Stack

- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui (Radix).
- **Backend:** Supabase (Postgres + RLS, Auth, Realtime, Storage, Edge Functions en Deno).
- **Móvil:** Capacitor 8 (APK Android; pipeline iOS → TestFlight en `codemagic.yaml`).
- **Mapas:** Leaflet + OpenStreetMap. **Gráficas:** Recharts. **Tests:** Vitest + Testing Library + PGlite.

## Requisitos

- Node.js 20+ y npm.
- Un proyecto de Supabase (para desarrollo real) o el `.env` de pruebas (ver abajo).

## Puesta en marcha

```sh
npm install
cp .env.example .env   # y completa los valores
npm run dev            # http://localhost:8080
```

### Variables de entorno (`.env`)

| Variable | Uso |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Conexión a Supabase (obligatorias). |
| `VITE_PUBLIC_SITE_URL` | Dominio público; base de los enlaces de correo y de la página de pago `/pay`. |
| `VITE_IZIPAY_PUBLIC_KEY` | Clave pública de Izipay (Back Office → Claves de API REST). |
| `VITE_HCAPTCHA_SITE_KEY` | Sitekey de hCaptcha (login de staff). Sin ella se usa la de prueba. |

Las llaves **secretas** (Izipay Shop/Password/HMAC, Factiliza, Resend, `service_role`)
viven como *secrets* de las Edge Functions, **nunca** en el repo. Ver los `DEPLOY.md`
en `supabase/functions/*/`.

## Scripts

```sh
npm run dev        # servidor de desarrollo
npm run build      # build de producción (dist/)
npm run lint       # ESLint
npm run test       # suite de Vitest (una pasada)
npm run test:watch # Vitest en modo watch
```

> **Tests:** requieren un `.env` local con `VITE_SUPABASE_URL`/`ANON_KEY` (aunque sean
> valores dummy), o `createClient("")` lanza «supabaseUrl is required». El `.env` está
> en `.gitignore`. Algunos tests de migraciones usan PGlite (Postgres en WASM); si la
> máquina va lenta puede hacer falta subir el `--hookTimeout`.

## Estructura

```
src/
  pages/        # rutas por rol (público, buscador, anunciante, admin, superadmin)
  components/   # UI y componentes de dominio (Navbar, layouts, modales…)
  lib/          # acceso a datos y lógica (auth, publish, credits, payments, pricing…)
  hooks/        # hooks (useSession, useUnreadMessages, useKeyboardInset…)
  test/         # Vitest
supabase/
  migrations/   # esquema SQL versionado (0001–00xx), RLS, RPCs, triggers
  functions/    # Edge Functions (create-payment, payment-webhook, verify-doc…)
android/        # proyecto Capacitor Android
capacitor.config.ts
codemagic.yaml  # CI de build iOS → TestFlight
```

## Móvil

- **Android:** `npm run build && npx cap sync android`, luego abrir `android/` en Android Studio.
- **iOS:** lo compila `codemagic.yaml` (regenera `ios/` con `npx cap add ios` en cada build).
  Estado y pendientes de iOS en [`CHECKLIST.md`](./CHECKLIST.md) y [`PLAN-IMPLEMENTACION.md`](./PLAN-IMPLEMENTACION.md).

## Documentación de estado

- [`CHECKLIST.md`](./CHECKLIST.md) — inventario «hecho / falta» de todo el proyecto.
- [`PLAN-IMPLEMENTACION.md`](./PLAN-IMPLEMENTACION.md) — plan por fases y pendientes externos (llaves, APNs…).
