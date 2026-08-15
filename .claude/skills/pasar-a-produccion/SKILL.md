---
name: pasar-a-produccion
description: Lleva eFFe Multiclasificados de pruebas a producción — deja la base de datos limpia (borra avisos, usuarios, pagos y comprobantes de prueba) y conmuta pagos y facturación electrónica al entorno real. Usar cuando el usuario diga "pasar a producción", "salir a producción", "limpiar la app para producción", "borrar los datos de prueba" o invoque /pasar-a-produccion.
---

# Pasar a producción — eFFe Multiclasificados

Esta skill hace el salto de PRUEBAS a PRODUCCIÓN. Son dos cosas distintas y
conviene no mezclarlas:

1. **Vaciar los datos de prueba** — avisos, usuarios, pagos, comprobantes.
2. **Conmutar los interruptores** — Izipay real, Factiliza real, modo producción.

> **Esto no se deshace.** Borrar los datos es irreversible y emitir con las
> credenciales reales pone documentos fiscales de verdad en circulación ante
> SUNAT. **Nunca lo ejecutes sin que el usuario lo haya pedido explícitamente en
> este mismo turno**, y confirma antes de cada bloque destructivo.

---

## Antes de nada: comprobar que se puede

No sigas si falta alguna de estas. Preguntar es más barato que arreglar.

| Requisito | Cómo se comprueba |
|---|---|
| Factiliza dio de alta el RUC de Coleffe (`20616009061`) | Preguntar al usuario. Sin esto, emitir falla con «Su usuario no se encuentra configurado para el RUC» |
| Tenemos token de facturación de PRODUCCIÓN | Preguntar. El de pruebas (AD360) no vale |
| Tenemos la URL de producción de Factiliza | Preguntar. La de QA es `apife-qa…`; la real es `apife.factiliza.com` |
| Izipay tiene credenciales de PRODUCCIÓN | La clave pública de producción NO contiene `testpublickey_` |
| Hay copia de seguridad reciente | Supabase → Database → Backups |

Comprobar en qué modo está Izipay ahora mismo (no hace falta cobrar nada):

```bash
# La respuesta de create-payment trae la publicKey. Si contiene
# "testpublickey_", sigue en pruebas.
```

---

## Paso 1 · Vaciar los datos de prueba

**Confirma con el usuario antes de ejecutarlo.** Enséñale primero el recuento de
lo que se va a borrar y espera un sí.

El orden importa: se borra de las hojas hacia la raíz para no chocar con las
claves foráneas. Todo va en una transacción — si algo falla, no se borra nada.

```sql
-- RECUENTO PRIMERO (no borra nada). Enseñar esto al usuario.
select
  (select count(*) from public.listings)            as avisos,
  (select count(*) from public.invoices)            as comprobantes,
  (select count(*) from public.orders)              as ordenes,
  (select count(*) from auth.users)                 as usuarios,
  (select count(*) from public.complaints)          as reclamos;
```

Este bloque está **verificado contra el esquema real** (se probó entero dentro de
una transacción con `rollback`, así que el orden respeta las claves foráneas).

```sql
begin;

-- Interacciones y actividad sobre los avisos
delete from public.listing_events;
delete from public.favorites;
delete from public.messages;
delete from public.conversations;
delete from public.job_applications;      -- postulaciones a empleos
delete from public.reviews;
delete from public.reports;
delete from public.saved_searches;
delete from public.notifications;
delete from public.communications;
delete from public.device_tokens;         -- tokens de push

-- Comercio: bitácora → comprobantes → órdenes → saldo
delete from public.invoice_emission_attempts;
delete from public.invoices;
delete from public.order_listings;
delete from public.orders;
delete from public.credit_transactions;
delete from public.user_credits;

-- Avisos y sus ficheros
delete from public.listing_documents;
delete from public.listing_images;
delete from public.listings;

-- Libro de reclamaciones
delete from public.complaints;

-- Bitácora del panel: opcional. Es el registro de quién hizo qué en el admin.
-- Preguntar al usuario si quiere conservarla.
-- delete from public.audit_logs;

commit;
```

**Lo que NO se toca, porque es configuración y no datos de prueba:**
`categories`, `subcategories`, `pricing_settings`, `promotions`,
`system_settings`, `role_permissions`, `invoice_series` (sus contadores se
ajustan aparte, más abajo).

**Los ficheros de Storage no se borran con SQL.** Hay que vaciar los buckets de
avisos aparte (Supabase → Storage), o quedarán huérfanos ocupando espacio.
Dejar intactos `site-assets` y las imágenes de categoría: son configuración, no
datos de prueba.

### Los usuarios: preguntar antes

Borrar `auth.users` echa a todo el mundo, **incluidos los administradores**. Hay
dos opciones y hay que preguntar cuál quiere:

```sql
-- (a) Borrar TODOS menos el staff
delete from auth.users u
 where not exists (select 1 from public.user_roles r where r.user_id = u.id);

-- (b) Borrar absolutamente todos  ← deja la app sin admin: hay que crear uno
--     nuevo después (ver la receta de provisionar superadmin)
delete from auth.users;
```

### Reiniciar los contadores de comprobantes

Con la base vacía, la numeración fiscal empieza de cero. **Confirmar con el
usuario el número de arranque**: si ya emitió comprobantes por otro medio, la
serie tiene que continuar donde iba, no volver a 1.

```sql
update public.invoice_series set correlativo = 0, correlativo_pruebas = 0;
```

---

## Paso 2 · Conmutar a producción

### 2.1 · El modo de la aplicación

Es el interruptor del que cuelga todo lo demás: a partir de aquí los
comprobantes usan las series reales (B001/F001), sin marca de prueba.

```sql
update public.system_settings set value = 'true'::jsonb where key = 'app_produccion';
```

### 2.2 · Facturación electrónica (Factiliza)

```bash
supabase secrets set --project-ref prhbgniwymaaevnisyov \
  FACTILIZA_INVOICE_URL="https://apife.factiliza.com/api/v1/invoice/send" \
  FACTILIZA_INVOICE_TOKEN="<token de PRODUCCIÓN que dé Factiliza>"

# El RUC de pruebas deja de tener sentido: se quita para que no pueda usarse
# por error.
supabase secrets unset --project-ref prhbgniwymaaevnisyov EMISOR_RUC_PRUEBAS
```

Comprobar que `EMISOR_RUC` es el de Coleffe (`20616009061`) y `EMISOR_NOMBRE` la
razón social correcta: **es lo que sale impreso en cada comprobante**.

Y encender la emisión, si no lo estaba:

```sql
update public.system_settings set value = 'true'::jsonb where key = 'invoice_emission_enabled';
```

### 2.3 · Pagos (Izipay)

```bash
supabase secrets set --project-ref prhbgniwymaaevnisyov \
  IZIPAY_SHOP_ID="<shop de producción>" \
  IZIPAY_PASSWORD="<prodpassword_…>" \
  IZIPAY_HMAC_KEY="<clave HMAC de producción>" \
  IZIPAY_PUBLIC_KEY="<…:publickey_…>"     # sin "test"
```

En Vercel hay que actualizar también `VITE_IZIPAY_PUBLIC_KEY` y redesplegar, o
el formulario de pago del navegador seguirá apuntando a pruebas.

> Ojo con la URL del IPN en el Back Office de Izipay: la de producción es una
> configuración distinta de la de pruebas. Si no se cambia, los pagos se cobran
> pero el webhook nunca llega y el saldo no se acredita.

### 2.4 · Volver a desplegar las funciones

```bash
supabase functions deploy emit-invoice --no-verify-jwt --project-ref prhbgniwymaaevnisyov
supabase functions deploy create-payment --project-ref prhbgniwymaaevnisyov
supabase functions deploy payment-webhook --no-verify-jwt --project-ref prhbgniwymaaevnisyov
```

### 2.5 · Subir la versión

`src/lib/version.ts` — `APP_VERSION` y `APP_VERSION_DATE`. Se ve en Ajustes y en
el pie del panel, y es lo que permite saber qué build está en producción.

---

## Paso 3 · Comprobar que quedó bien

No lo des por hecho sin mirarlo.

```sql
-- Los interruptores
select key, value from public.system_settings
 where key in ('app_produccion', 'invoice_emission_enabled', 'maintenance_mode')
 order by key;

-- Las series arrancan donde deben
select id, serie, correlativo, serie_pruebas, correlativo_pruebas
  from public.invoice_series order by id;

-- No debe quedar NADA marcado como prueba
select count(*) as comprobantes_de_prueba from public.invoices where es_prueba;

-- El barrido de comprobantes tiene que seguir programado
select jobname, schedule from cron.job order by jobname;
```

Y a mano, en la app:

1. **Una compra real, de importe pequeño.** Que llegue el correo, que el
   comprobante tenga serie B001 y **que no lleve la marca de prueba**.
2. Que el comprobante quede `sunat_status = 'aceptado'` en el panel de admin.
3. Publicar un aviso y verlo en la portada.

Si algo falla, el freno de mano es apagar la emisión —
`invoice_emission_enabled = false` — - los comprobantes vuelven a ser internos y
nadie deja de comprar mientras se arregla.

---

## Volver atrás

Los interruptores se revierten en un segundo:

```sql
update public.system_settings set value = 'false'::jsonb where key = 'app_produccion';
update public.system_settings set value = 'false'::jsonb where key = 'invoice_emission_enabled';
```

**Los datos borrados no.** De ahí la copia de seguridad del principio.
