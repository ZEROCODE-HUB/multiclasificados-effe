# Envío de correos del Centro de mensajes (Edge Function `send-email`)

La pantalla **Comunicaciones** (`/dashboard/{admin,superadmin}/comunicaciones`) ya
envía notificaciones **in-app + push** reales. Si marcas la casilla *"Enviar también
por correo electrónico"*, además se inserta una fila `channel='email'` en
`notifications`, y el trigger `notifications_email` llama a la Edge Function
`send-email`, que manda el correo vía **[Resend](https://resend.com)**.

Para que el email funcione en producción sigue estos pasos.

---

## Paso 0 — Aplicar la migración de BD

```bash
supabase link --project-ref prhbgniwymaaevnisyov   # si aún no está enlazado
supabase db push                                   # aplica 0039_admin_communications.sql
```

Esto crea las RPCs `admin_send_message`, `admin_broadcast`, `admin_audience_count`
y el trigger `notifications_email`. **Los envíos in-app y push ya funcionan solo con
este paso** (no necesitan Resend).

## Paso 1 — Crear cuenta y API key en Resend (tú)

1. Entra a https://resend.com y crea una cuenta.
2. **API Keys → Create API Key** → copia la clave (`re_...`).
3. **Domains → Add Domain**: agrega y verifica tu dominio (registros DNS que te da
   Resend). Sin dominio verificado solo puedes enviar desde `onboarding@resend.dev`
   y a tu propio correo (modo pruebas).

## Paso 2 — Desplegar la función y cargar los secretos (tú)

```bash
# Subir la función
supabase functions deploy send-email --no-verify-jwt

# Secretos (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya los provee Supabase)
supabase secrets set RESEND_API_KEY="re_tu_api_key"
supabase secrets set EMAIL_FROM="eFFe Clasificados <no-reply@tudominio.com>"
```

> `--no-verify-jwt` porque la función la invoca el trigger de la BD (pg_net), no un
> usuario con sesión. La función igualmente ignora cualquier fila que no sea
> `channel='email'`.

## Paso 3 — (una vez) habilitar pg_net para el trigger

El trigger usa `pg_net` para el POST HTTP. La migración ejecuta
`create extension if not exists pg_net` (ya venía de `0026_push_trigger.sql`), así
que normalmente no hay que hacer nada extra.

---

## Cómo verificar

1. En el panel, envía un mensaje individual a tu propio correo con la casilla de
   email marcada.
2. Revisa **Resend → Logs** para ver el correo entregado.
3. Si no llega: revisa `supabase functions logs send-email`. Errores típicos:
   - `falta RESEND_API_KEY` → no cargaste el secreto.
   - `422 domain is not verified` → verifica el dominio o usa `onboarding@resend.dev`.

## Notas

- Sin `RESEND_API_KEY`, la función no falla el envío: registra un aviso y no manda
  correo (los envíos in-app + push siguen funcionando).
- El remitente `EMAIL_FROM` debe pertenecer a un dominio verificado en Resend.
- Cambiar de proveedor (SMTP, SendGrid, etc.) solo requiere reescribir el `fetch`
  de `supabase/functions/send-email/index.ts`; el resto (trigger, RPCs, UI) no cambia.
