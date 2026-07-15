# Edge Function `create-payment` — Inicia el cobro con Izipay/Lyra

Primer paso del cobro real para **comprar saldo**. Recibe la configuración de la
compra (cantidad, duración, adicionales y datos del comprobante), **recalcula el
monto en el servidor** desde `pricing_settings`, crea la orden en estado
`pending` y pide el `formToken` a Izipay. **Nunca** acredita créditos ni emite la
boleta: eso ocurre en `payment-webhook` cuando el pago se confirma.

## 1) Configurar los secrets

Las llaves se obtienen en el Back Office de micuentaweb.pe →
**Configuración › Tienda › Claves de API REST**. Empieza con las de **TEST**.

```bash
supabase secrets set IZIPAY_SHOP_ID="XXXXXXXX"
supabase secrets set IZIPAY_PASSWORD="testpassword_xxxxxxxxxxxxxxxx"
# Opcional: si prefieres servir la clave pública desde el backend en vez del .env del front
supabase secrets set IZIPAY_PUBLIC_KEY="XXXXXXXX:testpublickey_xxxxxxxx"
# Opcional: host de la API (por defecto https://api.micuentaweb.pe)
# supabase secrets set IZIPAY_API_HOST="https://api.micuentaweb.pe"
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta
> Supabase automáticamente; no hay que configurarlos.

## 2) Desplegar la función

```bash
supabase functions deploy create-payment
```

**Sin `--no-verify-jwt`.** El cobro es una acción sensible: el gateway filtra las
peticiones sin JWT y el código, además, exige una sesión de usuario real y
rechaza la anon key (igual que `verify-doc`).

## 3) Probar en local (opcional)

```bash
# crea supabase/functions/.env con IZIPAY_SHOP_ID / IZIPAY_PASSWORD / ...
supabase functions serve create-payment --env-file supabase/functions/.env
```

## Contrato

Request (POST JSON, con `Authorization: Bearer <access_token del usuario>`):

```json
{
  "quantity": 1,
  "duration": 7,
  "extras": { "urgente": true },
  "receipt": {
    "receiptType": "boleta",
    "email": "juan@correo.com",
    "advertiserName": "JUAN PEREZ",
    "docType": "dni",
    "docNumber": "44443333",
    "factilizaData": { "direccion": "AV. LIMA 123" }
  }
}
```

Response OK:

```json
{ "success": true, "orderId": "…", "formToken": "…", "publicKey": "…" }
```

Response error: `{ "success": false, "error": "…" }`
(`401` sin sesión, `503` si faltan las llaves, `502` si Izipay rechaza la creación.)

## Endpoint de Izipay usado

- `POST https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment`
- Auth: `Authorization: Basic base64(ShopID:password)`
