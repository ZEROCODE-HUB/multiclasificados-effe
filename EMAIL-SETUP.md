# Correo del sistema — cómo está montado y cómo se verifica

## Estado: funcionando ✅ (verificado el 2026-08-12, entrega real confirmada)

Dominio `coleffe.com` **verificado en Resend** (región `sa-east-1`, envío habilitado),
así que el correo llega a **cualquier destinatario**, no solo al dueño de la cuenta.

## Los dos caminos del correo

Hay **dos vías distintas**, y conviene no confundirlas al diagnosticar:

| Vía | La usa | Remitente | Proveedor |
|---|---|---|---|
| **SMTP de Supabase Auth** | recuperar contraseña, cambio de email, invitaciones | `info@coleffe.com` | `smtp.resend.com:465` (usuario `resend`) |
| **API de Resend (Edge Functions)** | Centro de mensajes, Libro de Reclamaciones, comprobantes | ver tabla de secrets | `api.resend.com` |

Son credenciales **separadas**: el SMTP tiene su propia contraseña en la config de
Auth, y las funciones usan el secret `RESEND_API_KEY`. Que una funcione no implica
que la otra también — de hecho estuvieron desalineadas (ver más abajo).

## Secrets de correo (Supabase → Edge Functions → Secrets)

| Secret | Valor | Lo consume |
|---|---|---|
| `RESEND_API_KEY` | key del equipo Resend **dueño de `coleffe.com`** | send-email, send-reclamo, emit-invoice |
| `EMAIL_FROM` | `eFFe Clasificados <info@coleffe.com>` | send-email (Centro de mensajes) |
| `RECLAMOS_FROM` | `Libro de Reclamaciones <info@coleffe.com>` | send-reclamo |
| `RECLAMOS_TO` | `avisos@coleffe.com` | send-reclamo |
| `INVOICE_EMAIL_FROM` | `eFFe Multiclasificados <info@coleffe.com>` | emit-invoice |

> **Solo direcciones que existan de verdad.** Los buzones reales del cPanel son
> `avisos@`, `cesar@`, `info@`, `jalch.olkl@` y `privacidad@coleffe.com`. Hasta el
> 2026-08-13 la configuración usaba `team@`, `no-reply@`, `reclamos@`, `soporte@` y
> `comprobantes@`, que **nunca existieron**: los envíos salían igual (Resend firma por
> dominio, no comprueba el buzón), pero toda respuesta de un usuario rebotaba, y los
> avisos de reclamos apuntaban a un destino inexistente.

Sin los `*_FROM` cada función cae a `onboarding@resend.dev`, el remitente compartido
de pruebas de Resend, que **solo entrega al dueño de la cuenta** y perjudica la
entregabilidad. Por eso están configurados explícitamente.

> **Ojo con la cuenta/equipo de Resend.** Las API keys pertenecen a un equipo y solo
> ven los dominios de **ese** equipo. Si `RESEND_API_KEY` es de un equipo distinto al
> que verificó `coleffe.com`, Resend responde `403 The coleffe.com domain is not
> verified` aunque en el panel se vea verificado. Pasó exactamente eso el 2026-08-12.

## DNS del dominio (Vercel) — la recepción depende de esto

El dominio se movió a los nameservers de Vercel el **2026-08-07** y la zona empezó
vacía: se perdieron los MX, y con ellos **toda la recepción de correo**. Enviar siguió
funcionando (usa DKIM + `send.coleffe.com`, que Resend creó aparte), lo que hace fácil
creer que "el correo funciona" cuando en realidad solo funciona la mitad.

Los buzones viven en el clúster **`lc2.hostingcorreo.com` (67.222.28.131)** de
Latinoamérica Hosting — **no** en el servidor del cPanel (`184.107.5.178`), que solo
sirve web/panel. Registros a mantener en Vercel → Domains → coleffe.com:

| Name | Type | Value | Prioridad |
|---|---|---|---|
| *(vacío)* | MX | `mx1.hostingcorreo.com` | 10 |
| *(vacío)* | MX | `mx2.hostingcorreo.com` | 20 |
| *(vacío)* | MX | `mx3.hostingcorreo.com` | 30 |
| *(vacío)* | MX | `mx4.hostingcorreo.com` | 40 |
| *(vacío)* | TXT | `v=spf1 +mx +ip4:184.107.5.178 include:relay.mailchannels.net ~all` | — |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | — |
| `default._domainkey` | TXT | DKIM del cPanel (copiar del Zone Editor, una sola línea) | — |
| `mail` | CNAME | `lc2.hostingcorreo.com` | — |
| `webmail` / `cpanel` | A | `184.107.5.178` | — |
| `quicknote` | CNAME | `quicknote-web.onrender.com` | — |

El SPF va **sin** el `+a` que tenía en el cPanel: ese `a` ahora resuelve a las IPs de
Vercel y las autorizaría a enviar en nombre del dominio. Clientes de correo (IMAP 143/993,
SMTP 587/465): usar `lc2.hostingcorreo.com`, que es el nombre que coincide con el
certificado. **No** recrear `_acme-challenge` ni `_cpanel-dcv-test-record`.

Diagnóstico rápido de recepción: `dig MX coleffe.com` vacío ⇒ nadie recibe. En los logs
de Resend eso se ve como `delivery_delayed` y luego `bounced`, nunca `delivered`.

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

Los correos de Auth están **en español y con la marca** desde el 2026-08-12: remitente
`"eFFe Clasificados" <team@coleffe.com>` y plantillas propias para recuperación,
cambio de correo, confirmación, enlace mágico, invitación y reautenticación (mismo
aire visual que `send-email`). Se editan en Authentication → Emails, o por la
Management API (`PATCH /v1/projects/{ref}/config/auth`, campos `smtp_sender_name`,
`mailer_subjects_*`, `mailer_templates_*_content`). **Los marcadores
`{{ .ConfirmationURL }}`, `{{ .NewEmail }}` y `{{ .Token }}` deben conservarse** — sin
ellos el correo sale sin enlace y el flujo se rompe en silencio.

La pantalla `/reset-password` acepta tanto `?token_hash=...` como los enlaces
implícitos/PKCE. En web el cliente usa flujo **implícito** a propósito
(`src/lib/supabase.ts`) para que el enlace funcione aunque se abra en otro navegador.
