# emit-invoice — despliegue y configuración

Envía al comprador su comprobante de compra de saldo (PDF adjunto por correo).
La llama la propia base de datos en cuanto se liquida un pago, el barrido
periódico, y el botón **Reintentar** del panel de administración.

> **Nada de esto puede costarle créditos a un usuario.** Cuando esta función
> entra en juego, el pago ya está liquidado y los créditos acreditados. Si algo
> falla, se registra y se reintenta; el saldo del usuario nunca se toca.

## Desplegar

```bash
supabase functions deploy emit-invoice --no-verify-jwt
```

`--no-verify-jwt` porque la llama la base de datos, sin sesión de usuario: se
identifica con un secreto compartido (abajo). Las llamadas desde el panel sí
llevan el JWT del staff y se validan con `has_perm('Pagos y planes','edit')`.

## Secrets

```bash
# Obligatorios para que el correo salga
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set INVOICE_WORKER_SECRET="una-cadena-larga-al-azar"

# Recomendados
supabase secrets set INVOICE_EMAIL_FROM="eFFe Multiclasificados <facturacion@coleffe.com>"
supabase secrets set EMISOR_NOMBRE="Razón social de la empresa"
supabase secrets set EMISOR_RUC="20123456789"
supabase secrets set PUBLIC_SITE_URL="https://multiclasificados-effe.vercel.app"
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los inyecta la plataforma.

**El secreto va en DOS sitios y debe coincidir**, o la base de datos no podrá
avisar a la función:

```sql
update public.system_settings
   set value = '"la-misma-cadena-al-azar"'::jsonb
 where key = 'invoice_worker_secret';
```

## Qué pasa si falta algo

| Falta | Consecuencia |
|---|---|
| `RESEND_API_KEY` | El comprobante se marca `email_status = 'omitido'`. Se genera y se ve en la app; no se envía. |
| `INVOICE_WORKER_SECRET` o el de la BD | La base no puede avisar: los comprobantes se quedan en cola y se ven como pendientes en el panel. Nada se pierde. |
| `EMISOR_RUC` / `EMISOR_NOMBRE` | El PDF sale con el nombre por defecto y sin RUC. |

Ninguna de estas ausencias rompe una compra.

## ⚠️ Antes de que un cliente reciba nada

Resend está en **modo prueba sin dominio verificado**: hoy solo entrega correos
a la dirección del dueño de la cuenta. Hasta verificar `coleffe.com` (SPF/DKIM),
**ningún comprobante llegará a un comprador real**. Ver `EMAIL-SETUP.md`.

## Comprobar que funciona

```bash
# Reenviar un comprobante concreto
curl -X POST "$SUPABASE_URL/functions/v1/emit-invoice" \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $INVOICE_WORKER_SECRET" \
  -d '{"invoice_id":"<uuid del comprobante>"}'

# Barrer los pendientes (lo mismo que hace el cron)
curl -X POST "$SUPABASE_URL/functions/v1/emit-invoice" \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $INVOICE_WORKER_SECRET" \
  -d '{"sweep":true,"limit":20}'
```

En la base, el rastro de cada intento queda en `invoice_emission_attempts`:

```sql
select step, attempt, http_status, ok, created_at
  from public.invoice_emission_attempts
 where invoice_id = '<uuid>'
 order by created_at desc;
```

## Emisión ante SUNAT

Todavía **no** está activa: los comprobantes se emiten como internos
(`sunat_status = 'omitido'`) y así lo dicen el PDF y la interfaz. El interruptor
existe y está apagado a propósito:

```sql
update public.system_settings
   set value = 'true'::jsonb
 where key = 'invoice_emission_enabled';
```

**No lo enciendas todavía.** Antes hacen falta el RUC emisor dado de alta en
Factiliza con su certificado digital, las series autorizadas por SUNAT y la URL
de producción de su API. Encenderlo sin eso solo llenaría el panel de
comprobantes rechazados. Ver el plan de la iteración para la lista completa.
