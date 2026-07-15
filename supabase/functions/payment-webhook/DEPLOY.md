# Edge Function `payment-webhook` — IPN de Izipay/Lyra

Segundo paso del cobro. Izipay notifica **server-to-server** el resultado del
pago (IPN). Esta función valida la **firma HMAC-SHA256** del `kr-answer` y, si el
pago está **PAGADO**, llama a `settle_paid_order()` (idempotente) que acredita
los créditos y emite la boleta. **Es la única fuente de verdad del pago**: el
navegador solo hace polling del estado de la orden.

## 1) Configurar los secrets

```bash
supabase secrets set IZIPAY_PASSWORD="prodpassword_xxxxxxxxxxxxxxxx"
supabase secrets set IZIPAY_HMAC_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

- `IZIPAY_PASSWORD` valida la firma del **IPN** (`kr-hash-key: "password"`).
- `IZIPAY_HMAC_KEY` valida la firma del **retorno del navegador**
  (`kr-hash-key: "sha256_hmac"`), por si se usa.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase.

## 2) Desplegar la función

```bash
supabase functions deploy payment-webhook --no-verify-jwt
```

**Con `--no-verify-jwt`**: Izipay no envía un JWT de Supabase. La autenticidad se
comprueba con la **firma HMAC**, no con el gateway (mismo criterio que
`send-reclamo`, que también es público).

## 3) Registrar la URL en el Back Office

Back Office micuentaweb → **Configuración › Reglas de notificación**:

- **URL de notificación al final del pago (IPN)** =
  `https://<tu-proyecto>.supabase.co/functions/v1/payment-webhook`
- Repite la URL en la regla de **notificación en caso de pago rechazado/cancelado**.
- Algoritmo de firma: **HMAC-SHA-256**.

## Contrato

Request (POST `application/x-www-form-urlencoded` desde Izipay):
`kr-answer`, `kr-hash`, `kr-hash-key`, `kr-hash-algorithm`.

Respuestas: `200` cuando se procesa (Izipay marca la notificación como recibida);
`401` si la firma es inválida; `500` si falla la liquidación (Izipay reintenta —
`settle_paid_order` es idempotente, así que un reintento no duplica créditos).

## Idempotencia

Izipay puede reenviar el IPN. `settle_paid_order(order_id, payment_ref)` usa un
gate atómico `status <> 'paid'`: la primera notificación acredita y emite la
boleta; las siguientes devuelven `settled:false` sin efecto.
