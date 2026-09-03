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

## Estado a 2026-09-03 (comprobado contra producción)

Lo que falta para poder dar el salto, y lo que ya no.

| | Estado |
|---|---|
| Llave de Google Maps restringida (H-03) | ✅ hecho — conviene reconfirmar dominio y Map ID |
| La serie fiscal real B001 puede empezar en 1 | ✅ comprobado: nunca se aceptó nada con ella |
| Factiliza dio de alta el RUC `20616009061` | ❓ **preguntar** — sin esto la emisión real falla |
| Token y URL de PRODUCCIÓN de Factiliza | ❓ **preguntar** |
| Credenciales de PRODUCCIÓN de Izipay | ❓ **preguntar** |
| URL del IPN cambiada en el Back Office de Izipay | ❓ **preguntar** |
| Vaciar los datos y el Storage | ⬜ paso 1 |
| Conmutar los interruptores | ⬜ paso 2 |
| APK/IPA en la tienda, y sólo después el OTA | ⬜ **va el último** |

La foto de la base ahora mismo: 436 avisos, 156 órdenes, 135 comprobantes,
112 usuarios, 896 ficheros en Storage y `app_produccion = false`.

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

> **La única vuelta atrás es la copia diaria.** El PITR (volver a un minuto
> concreto) está DESACTIVADO en este proyecto, y las copias son de los últimos
> 7 días. Además se restauran ENTERAS: no se puede recuperar sólo una tabla. Si
> algo del borrado sale mal, la alternativa es levantar un proyecto aparte con la
> copia y extraer de ahí lo que haga falta.

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
delete from public.notification_preferences;
delete from public.communications;
delete from public.device_tokens;         -- tokens de push
delete from public.doc_lookups;           -- DNI/RUC consultados a Factiliza

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
delete from public.listing_videos;
delete from public.listings;

-- Libro de reclamaciones
delete from public.complaints;

-- "Trabaje con nosotros" (0135). NO cuelga de ningún aviso ni de ningún
-- usuario, así que no cae por cascada: si no se borra aquí, se queda.
-- Sus CV están en el bucket `cvs` y hay que vaciarlo aparte.
delete from public.careers;

-- Bitácora del panel: opcional. Es el registro de quién hizo qué en el admin.
-- Preguntar al usuario si quiere conservarla.
-- delete from public.audit_logs;

commit;
```

**Lo que NO se toca, porque es configuración y no datos de prueba:**
`categories`, `subcategories`, `pricing_settings`, `promotions`,
`system_settings`, `role_permissions`, `invoice_series` (sus contadores se
ajustan aparte, más abajo).

**Los ficheros de Storage no se borran con SQL.** Hay que vaciarlos aparte
(Supabase → Storage) o quedarán huérfanos ocupando espacio. Son OCHO buckets y
no todos se tratan igual:

| Bucket | Qué hacer | Por qué |
|---|---|---|
| `listing-images` | **Vaciar** | Fotos de los avisos de prueba |
| `listing-videos` | **Vaciar** | Vídeos de los avisos |
| `listing-docs` | **Vaciar** | PDF adjuntos (privado) |
| `avatars` | **Vaciar** | Fotos de perfil de las cuentas de prueba |
| `cvs` | **Vaciar** | CV de «Trabaje con nosotros». Son datos personales de terceros |
| `site-assets` | **Dejar** | Configuración: logo, imagen por defecto |
| `category-images` | **Dejar** | Configuración: las 16 categorías |
| `ota` | **Ver abajo** | Paquetes de actualización del móvil, no datos de prueba |

`avatars` y `cvs` no estaban en la versión anterior de esta receta, y los dos
guardan datos personales: dejarlos es justo lo que no se quiere al abrir al
público.

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

Con la base vacía, la numeración fiscal empieza de cero. La pregunta de siempre
es si la serie real puede volver a 1 o tiene que continuar donde iba.

**Aquí ya está respondido, y con datos** (comprobado el 2026-09-03): la serie
real **B001 NUNCA llegó a SUNAT**. De los 67 comprobantes emitidos con ella, 60
quedaron en `omitido` —nunca se enviaron—, 6 en `rechazado` y 1 en `vencido`.
**Ninguno aceptado.** Lo único que SUNAT aceptó son los 66 de las series de
prueba B066/F066, que van contra el entorno de homologación de Factiliza y no
existen para la administración.

Así que **B001 puede arrancar en 1** sin dejar huecos declarados. Lo mismo para
F001, que está en 0 y nunca se usó.

```sql
-- Comprobar ANTES, y enseñárselo al usuario. Si aquí apareciera alguna B001/F001
-- en 'aceptado', PARAR: esa serie ya está quemada y no puede volver a 1.
select serie, sunat_status, count(*), min(number), max(number)
  from public.invoices where es_prueba is not true
 group by serie, sunat_status order by serie;

update public.invoice_series
   set correlativo = 0, correlativo_pruebas = 0,
       correlativo_nota = 0, correlativo_nota_pruebas = 0;
```

Los contadores de NOTAS de crédito (`correlativo_nota`) faltaban en la versión
anterior: sin reiniciarlos, la primera nota real saldría con el número que dejó
la última de prueba.

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
supabase functions deploy emit-invoice    --no-verify-jwt --project-ref prhbgniwymaaevnisyov
supabase functions deploy create-payment                  --project-ref prhbgniwymaaevnisyov
supabase functions deploy payment-webhook --no-verify-jwt --project-ref prhbgniwymaaevnisyov
supabase functions deploy verify-payment  --no-verify-jwt --project-ref prhbgniwymaaevnisyov
```

`verify-payment` no estaba y también lee las credenciales de Izipay: es la que
rescata los pagos cuyo webhook se perdió. Si se queda con las de pruebas,
consultará el entorno equivocado y dará por no pagado un cobro real.

**Conservar el `--no-verify-jwt` de cada una tal cual.** Un webhook o un correo
que de pronto exija sesión deja de funcionar en silencio.

### 2.5 · Lo demás que hay que mirar

Nada de esto estaba en la primera versión de la receta y todo puede morder.

**La llave de Google Maps (era el punto H-03 de la auditoría).** Viaja dentro del
paquete de la web, así que cualquiera puede leerla: sin restringir, la factura de
Maps es de quien la encuentre. Tiene que estar limitada por dominio (`coleffe.com`
y `*.coleffe.com`) y, para el APK/IPA, por nombre de paquete y huella. Comprobar
también que el Map ID sigue asociado.

**El correo (Resend).** Que el dominio esté verificado y que el remitente sea el
que se quiere ver: el buzón bueno es `avisos@coleffe.com`. `soporte@coleffe.com`
NO existe, y `coleffec@coleffe.com` es la cuenta del hosting, no un buzón.

**Los topes de la 0124.** El freno de publicación vive en triggers, no en las
Edge Functions. Un tope en 0 lo DESACTIVA, así que conviene mirar que los valores
de producción son los que se quieren y no los que se dejaron para poder probar.

```sql
select key, value from public.system_settings where key ilike '%limit%' or key ilike '%tope%';
```

**La aplicación móvil, y el OTA.** Esto es lo más fácil de estropear:

> El APK/IPA publicado sigue en la versión 2.6. Si se enciende la actualización
> por aire (OTA) apuntando a un paquete viejo, **un teléfono recién actualizado
> se DEGRADA al arrancar**. No tocar el OTA hasta que la tienda tenga la versión
> nueva, y sólo entonces subir `app_latest_build`, `app_version_name`,
> `app_download_url` y `app_update_notes`.

El bucket `ota` NO se vacía como los demás: no son datos de prueba, son los
paquetes de actualización.

### 2.6 · Subir la versión

`src/lib/version.ts` — `APP_VERSION` y `APP_VERSION_DATE`. Se ve en Ajustes y en
el pie del panel, y es lo que permite saber qué build está en producción.

Y en Vercel, revisar las variables del build antes de redesplegar:
`VITE_IZIPAY_PUBLIC_KEY` (la de producción, sin `test`), la llave de Google Maps
y `VITE_PWA` — que debe estar SIN valor o distinto de `off`, o la web deja de ser
instalable y además se desinstala en quien ya la tuviera.

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

-- Y NADA de los datos de prueba. Si alguna de estas no da 0, se saltó una tabla:
-- las que más se olvidan son `careers` y `doc_lookups`, porque no cuelgan de
-- ningún aviso y no caen por cascada.
select
  (select count(*) from public.listings)     as avisos,
  (select count(*) from public.orders)       as ordenes,
  (select count(*) from public.careers)      as postulaciones_a_la_empresa,
  (select count(*) from public.doc_lookups)  as consultas_de_documento,
  (select count(*) from public.complaints)   as reclamos,
  (select count(*) from storage.objects
    where bucket_id in ('listing-images','listing-videos','listing-docs','avatars','cvs'))
                                             as ficheros_sueltos;

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
