# Desplegar `verify-payment`

Red de seguridad del cobro: le pregunta a Izipay cómo quedó una orden cuando el
aviso de pago (IPN) no llegó. Sin esto, una orden pagada cuyo webhook se perdió
se queda `pending` para siempre y el usuario paga sin recibir su saldo.

## 1. Desplegar la función

```bash
npx supabase functions deploy verify-payment --no-verify-jwt --project-ref prhbgniwymaaevnisyov
```

`--no-verify-jwt` porque la llama también la propia base de datos (el barrido de
`sweep_pending_orders`), que no manda JWT. La entrada de usuario valida el token
por su cuenta y la del barrido, el secreto compartido.

## 2. Secrets

Reutiliza los mismos de `create-payment` — no hacen falta credenciales nuevas:

| Secret | De dónde sale |
|---|---|
| `IZIPAY_SHOP_ID` | Back Office → Configuración › Tienda › Claves de API REST |
| `IZIPAY_PASSWORD` | ídem (clave de producción) |
| `IZIPAY_API_HOST` | opcional, por defecto `https://api.micuentaweb.pe` |
| `PAYMENT_WORKER_SECRET` | inventado por ti; tiene que coincidir con el de la base (paso 3) |

```bash
npx supabase secrets set PAYMENT_WORKER_SECRET="<una cadena larga y aleatoria>" --project-ref prhbgniwymaaevnisyov
```

## 3. El mismo secreto, en la base de datos

La migración `0109` crea la fila vacía; hay que rellenarla con el MISMO valor
(si no coinciden, el barrido llama y la función lo rechaza):

```sql
update public.system_settings
   set value = to_jsonb('<la misma cadena>'::text)
 where key = 'payment_worker_secret';
```

## 4. Comprobar

```sql
-- Debe devolver cuántas órdenes despertó (0 si no hay pendientes de más de 2 min).
select public.sweep_pending_orders(20);

-- El cron queda programado cada 5 minutos:
select jobname, schedule from cron.job where jobname = 'sweep-pending-orders';
```

Y la prueba que importa de verdad, en el móvil: pagar, cortar la red antes de que
llegue el IPN, y comprobar que al volver a abrir la app el saldo aparece solo.
Repetirlo una segunda vez no debe acreditar el doble (lo impide
`settle_paid_order`, que es idempotente).
