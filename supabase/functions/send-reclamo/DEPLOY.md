# Despliegue — Libro de Reclamaciones (send-reclamo)

Pasos para dejar funcionando el envío de reclamos por correo.

Project ref de Supabase: `prhbgniwymaaevnisyov`

---

## 1. Crear la tabla en la BD (migración 0034)

```bash
node supabase/run-migrations.mjs "<CONNECTION_STRING>" 0034
```
> El `<CONNECTION_STRING>` se saca de Supabase → Project Settings → Database → Connection string (pooler).

## 2. Guardar los secrets en Supabase

```bash
# API key de Resend (obligatorio)
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx --project-ref prhbgniwymaaevnisyov
```

### Modo PRUEBA (sin dominio verificado todavía)
Resend solo deja enviar al correo de tu propia cuenta. Apunta los reclamos ahí:
```bash
npx supabase secrets set RECLAMOS_TO=oscarmijael7w7@gmail.com --project-ref prhbgniwymaaevnisyov
# RECLAMOS_FROM se queda por defecto (onboarding@resend.dev)
```

### Modo PRODUCCIÓN (cuando coleffe.com esté verificado en Resend)
```bash
# Quita el override de prueba para usar los correos oficiales por defecto:
npx supabase secrets unset RECLAMOS_TO --project-ref prhbgniwymaaevnisyov
# Remitente con el dominio verificado:
npx supabase secrets set RECLAMOS_FROM="eFFe Reclamos <reclamos@coleffe.com>" --project-ref prhbgniwymaaevnisyov
```
> Por defecto el correo va a `reclamos@coleffe.com` y `soporte@coleffe.com`.

## 3. Desplegar la función

```bash
npx supabase functions deploy send-reclamo --no-verify-jwt --project-ref prhbgniwymaaevnisyov
```
> `--no-verify-jwt` permite que visitantes sin sesión envíen reclamos.

## 4. Probar

1. Abre la web (local o desplegada), baja al Libro de Reclamaciones, envía un reclamo.
2. Verifica: pantalla de confirmación con N.º → correo recibido → fila en la tabla `complaints`.
3. Logs si algo falla: Supabase → Edge Functions → send-reclamo → Logs.

---

## Verificar dominio coleffe.com en Resend (para producción)
Resend → Domains → Add Domain → `coleffe.com` → copiar los registros DNS (TXT/MX/DKIM)
y pegarlos en el panel donde se administra el dominio. Esperar la verificación.
