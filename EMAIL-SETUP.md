# Correo del sistema — cómo está montado y cómo se verifica

## Estado: funcionando ✅ (verificado el 2026-08-12, entrega real confirmada)

Dominio `coleffe.com` **verificado en Resend** (región `sa-east-1`, envío habilitado),
así que el correo llega a **cualquier destinatario**, no solo al dueño de la cuenta.

## Los dos caminos del correo

Hay **dos vías distintas**, y conviene no confundirlas al diagnosticar:

| Vía | La usa | Remitente | Proveedor |
|---|---|---|---|
| **SMTP de Supabase Auth** | recuperar contraseña, cambio de email, invitaciones | `team@coleffe.com` | `smtp.resend.com:465` (usuario `resend`) |
| **API de Resend (Edge Functions)** | Centro de mensajes, Libro de Reclamaciones, comprobantes | ver tabla de secrets | `api.resend.com` |

Son credenciales **separadas**: el SMTP tiene su propia contraseña en la config de
Auth, y las funciones usan el secret `RESEND_API_KEY`. Que una funcione no implica
que la otra también — de hecho estuvieron desalineadas (ver más abajo).

## Secrets de correo (Supabase → Edge Functions → Secrets)

| Secret | Valor | Lo consume |
|---|---|---|
| `RESEND_API_KEY` | key del equipo Resend **dueño de `coleffe.com`** | send-email, send-reclamo, emit-invoice |
| `EMAIL_FROM` | `eFFe Clasificados <no-reply@coleffe.com>` | send-email (Centro de mensajes) |
| `RECLAMOS_FROM` | `Libro de Reclamaciones <reclamos@coleffe.com>` | send-reclamo |
| `RECLAMOS_TO` | `reclamos@coleffe.com,soporte@coleffe.com` | send-reclamo |
| `INVOICE_EMAIL_FROM` | `eFFe Multiclasificados <comprobantes@coleffe.com>` | emit-invoice |

Sin los `*_FROM` cada función cae a `onboarding@resend.dev`, el remitente compartido
de pruebas de Resend, que **solo entrega al dueño de la cuenta** y perjudica la
entregabilidad. Por eso están configurados explícitamente.

> **Ojo con la cuenta/equipo de Resend.** Las API keys pertenecen a un equipo y solo
> ven los dominios de **ese** equipo. Si `RESEND_API_KEY` es de un equipo distinto al
> que verificó `coleffe.com`, Resend responde `403 The coleffe.com domain is not
> verified` aunque en el panel se vea verificado. Pasó exactamente eso el 2026-08-12.

## Cadena del Centro de mensajes

`admin_send_message` / `admin_broadcast` (RPC, staff-only)
→ INSERT en `notifications` con `channel='email'`
→ trigger `notifications_email` (migración `0039`) → `net.http_post` (pg_net)
→ Edge Function **send-email** (`verify_jwt=false`, imprescindible: el trigger no
manda cabecera `Authorization`) → API de Resend.

## Cómo verificar que sigue vivo

1. **Estado del dominio:** `GET https://api.resend.com/domains` con la API key →
   `"status": "verified"`.
2. **Cadena completa:** insertar una fila `channel='email'` en `notifications` y leer
   la respuesta que dejó pg_net:
   ```sql
   select id, status_code, left(content, 200), created
   from net._http_response order by id desc limit 3;
   ```
   `{"sent":1}` = enviado; un `error proveedor: ...` trae el mensaje literal de Resend.
3. **Entrega real:** `GET https://api.resend.com/emails?limit=10` → `last_event`
   debe ser `delivered` (no `bounced` ni `complained`).
4. **Recuperación de contraseña:** `POST /auth/v1/recover` responde 200 siempre (no
   filtra si el correo existe), así que el 200 **no prueba nada**; la prueba está en
   el log de Resend del punto 3.

## Límites a tener en cuenta

- Plan gratuito de Resend: 3.000 correos/mes y 100/día. Un envío masivo por email
  desde el Centro de mensajes a toda la base puede pasarse del límite diario.
- `rate_limit_email_sent` de Supabase Auth: 25/hora — aplica solo a los correos de
  Auth (recuperación, cambio de email), no al Centro de mensajes.
- El registro **no envía correo de confirmación**: `mailer_autoconfirm = true`, las
  cuentas quedan confirmadas al crearse. Es intencional.

## Plantillas de Auth

Los correos de Auth (recuperación, cambio de email) usan las plantillas **por defecto
de Supabase, en inglés**, y salen como `"team" <team@coleffe.com>`. Se cambian en
Authentication → Emails, o por la Management API (`PATCH /v1/projects/{ref}/config/auth`,
campos `mailer_subjects_recovery` / `mailer_templates_recovery_content` /
`smtp_sender_name`). El marcador `{{ .ConfirmationURL }}` debe conservarse.

La pantalla `/reset-password` acepta tanto `?token_hash=...` como los enlaces
implícitos/PKCE. En web el cliente usa flujo **implícito** a propósito
(`src/lib/supabase.ts`) para que el enlace funcione aunque se abra en otro navegador.
