# Edge Function `simulate-payment` — ⚠️ SOLO PRUEBAS

Simula una compra de saldo **sin cobrar**: crea la orden y la liquida al instante
con `settle_paid_order` (acredita el saldo y emite la boleta), igual que hace
`payment-webhook` cuando Izipay confirma. Es la única forma de que la simulación
genere la boleta real, porque `settle_paid_order` es `service_role` only.

## 🚨 Antes de desplegar, entiende el riesgo

Cada simulación crea una **boleta real** con número de serie (`B001-…`) en la base
de datos donde la despliegues. Eso **consume la numeración legal** que también usan
las ventas reales. El detalle se marca `[SIMULADO]` para poder identificarlas.

- **NO habilites esto en el proyecto Supabase de producción.**
- Úsalo solo en un proyecto de **pruebas/staging**.

## 1) Desplegar la función

```bash
supabase functions deploy simulate-payment --project-ref <TU_PROJECT_REF>
```

Sin `--no-verify-jwt`: el código exige una sesión de usuario real (rechaza la anon key).

> `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta
> Supabase automáticamente; no hay que configurarlos.

## 2) Activar el interruptor de seguridad

La función se **niega a correr** hasta que este secret sea exactamente `true`:

```bash
supabase secrets set ALLOW_FAKE_PAYMENT=true --project-ref <TU_PROJECT_REF>
```

Para desactivarla luego (recomendado al terminar de probar):

```bash
supabase secrets unset ALLOW_FAKE_PAYMENT --project-ref <TU_PROJECT_REF>
```

## 3) Mostrar el botón en el front

El botón "Simular pago" aparece automáticamente en desarrollo (`npm run dev`).
Para un deploy de staging, define en el entorno del front:

```
VITE_ALLOW_FAKE_PAYMENT=true
```

En producción, sin esa variable, el botón no se renderiza (se elimina del bundle).

## Limpieza de boletas de prueba

Las simulaciones dejan rastro `[SIMULADO]` en `invoices.detail`, `orders.extras.detail`
y `credit_transactions.description`, y `orders.payment_provider = 'simulado'`. Para
listarlas:

```sql
select number, detail, created_at from invoices where detail like '[SIMULADO]%';
```
