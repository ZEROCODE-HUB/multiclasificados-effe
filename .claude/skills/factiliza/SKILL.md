---
name: factiliza
description: Todo sobre la facturación electrónica de eFFe (Factiliza → SUNAT) — emitir boletas y facturas, reprocesar envíos, adjuntar PDF/XML oficiales, anular con nota de crédito, y las trampas de su API que cuestan un rechazo. Usar siempre que aparezca Factiliza, SUNAT, comprobantes, boletas, facturas, notas de crédito, anular una compra, o el correo con el comprobante.
---

# Facturación electrónica — Factiliza / SUNAT

> Todo lo que hay aquí está **verificado contra su API**, no deducido de la
> documentación. Cuando algo dice «comprobado», es que se mandó y se vio la
> respuesta. Su documentación tiene huecos y algún error; la API manda.

---

## 1. Estado actual (2026-08-15)

**La aplicación entera está en PRUEBAS.** Izipay corre con credenciales de test
(su clave pública contiene `testpublickey_`), así que ningún cobro que entra es
real — y por tanto ningún comprobante lo es tampoco.

| Interruptor (`system_settings`) | Valor | Qué hace |
|---|---|---|
| `app_produccion` | **false** | El que manda. false = todo es de prueba |
| `invoice_emission_enabled` | **true** | Emitir electrónicamente sí/no |

Con `app_produccion` en false, **todo** comprobante nace marcado
(`invoices.es_prueba`), usa las series de pruebas y avisa en el PDF y el correo
de que no tiene valor fiscal. La marca va **por comprobante y no por entorno**:
si dependiera del host, el día que convivan los dos tipos se etiquetarían mal.

**Lo único que falta para producción**: que Factiliza dé de alta el RUC de
Coleffe (`20616009061`). Después, la skill `pasar-a-produccion` tiene la receta.

---

## 2. Credenciales: la trampa nº 1

**Factiliza vende DOS productos con DOS tokens distintos y NO son
intercambiables.** Medido: el token de facturación devuelve **401** contra la API
de consultas, y el de consultas devuelve **401** contra la de facturación.

| Secret de Supabase | Para qué | Lo usa |
|---|---|---|
| `FACTILIZA_TOKEN` | consultar DNI/RUC | `verify-doc` |
| `FACTILIZA_INVOICE_TOKEN` | facturación | `emit-invoice` |

Estuvieron unificados y poner el de facturación en `FACTILIZA_TOKEN` habría roto
la validación de documentos de toda la app. `emit-invoice` cae a `FACTILIZA_TOKEN`
si la suya no está, solo por compatibilidad.

**Un 401 no significa que el token esté mal**: significa que no vale *para esa
API*. Antes de concluir nada, prueba las dos.

### RUC del emisor

| Secret | Valor | Cuándo |
|---|---|---|
| `EMISOR_RUC` | el de Coleffe (`20616009061`) | comprobantes reales |
| `EMISOR_RUC_PRUEBAS` | `10749283781` | comprobantes de prueba |

En el entorno de pruebas el emisor dado de alta es **el de Factiliza**, no el
nuestro: mandar el de Coleffe devuelve *«Su usuario no se encuentra configurado
para el RUC»*. `rucDelEmisor(esPrueba)` elige.

---

## 3. Los endpoints que existen de verdad

Barrido completo contra QA. **El resto de rutas devuelve 404.**

| Ruta | Cuerpo | Para qué |
|---|---|---|
| `POST /api/v1/invoice/send` | comprobante completo | emitir |
| `POST /api/v1/invoice/resend` | comprobante completo | **reprocesar** uno ya registrado |
| `POST /api/v1/invoice/pdf` | `tipo_Doc, serie, correlativo, empresa_Ruc` | PDF oficial |
| `POST /api/v1/invoice/xml` | ídem | XML firmado |
| `POST /api/v1/note/send` | nota completa | **anular** un comprobante |
| `POST /api/v1/note/pdf` · `/note/xml` | ídem que invoice | la nota |
| `POST /api/v1/voided/cancel` | identificadores + motivo | baja de factura (no se usa) |
| `POST /api/v1/summary/send` | resumen | boletas resumidas (no se usa) |

`/invoice/cdr` **no existe en QA** (sí en producción).

> **`/invoice/resend` es la pieza que más cuesta encontrar.** Con un barrido corto
> de diez nombres concluí que no existía, y me equivoqué dos veces seguidas sobre
> ello. Cuando un envío llega a Factiliza pero su traspaso a SUNAT falla, `send`
> contesta «ya existe» para siempre; `resend` lo vuelve a empujar sin duplicarlo.

### Hosts

| Host | Qué es |
|---|---|
| `apife-qa.factiliza.com` | pruebas (DEMO) — las respuestas empiezan por `DEMO - …` |
| `apife.factiliza.com` | facturación en producción |
| `api.factiliza.com` | consultas DNI/RUC (otro producto, otro token) |

---

## 4. Trampas del contrato (cada una es un rechazo)

1. **Un rechazo llega con HTTP 200.** Hay que leer `success` del cuerpo. Mirar el
   código HTTP daría por bueno un documento rechazado.
2. **`sub_Total` va CON IGV y `valor_Venta` SIN él.** No es un descuido de su
   documentación; confundirlos es rechazo seguro.
3. **`tip_Afe_Igv` es una CADENA** (`"10"`), no un número. Numérico da
   *"The JSON value could not be converted to System.String"*.
4. **En `/note/send` el campo es `Manual` con mayúscula**, mientras que en
   `/invoice/send` es `manual`. Parece un descuido suyo, pero es lo que valida.
5. **Los importes de la nota van en POSITIVO** aunque la nota reste. En negativo
   «porque devuelve dinero» es rechazo.
6. **`afectado_Num_Doc` va sin ceros de relleno**: `B066-24`, no `B066-000024`.
7. **`legend` con código 1000 (importe en letras) es obligatoria.**

### Cómo se interpreta la respuesta (`leerRespuesta`)

Lo decisivo es **el código del error y si viene `hash`**:

| Respuesta | Qué significa | Qué se hace |
|---|---|---|
| `success: true` + CDR | aceptado | fin |
| `error.code` **numérico** (0100-4000) | SUNAT juzgó los DATOS | **rechazado, no se reintenta** — reenviar da lo mismo y quema correlativo |
| `error.code` **no numérico** (`"HTTP"`) | fallo de comunicación entre ellos y SUNAT | reintentable |
| … y además viene `hash` | Factiliza YA lo tiene registrado | reintentar **contra `/resend`**, no contra `/send` |
| «pendiente de envío» | está en SU cola | esperar; **no gasta intento** |
| «ya existe un documento» | ya registrado | reintentable vía `resend` |

**Sondear sin emitir**: mandar el comprobante con un **RUC emisor inexistente**
(`00000000000`). Pasa la validación de forma y responde con un error de negocio,
así se sabe si el token autoriza sin gastar un correlativo.

---

## 5. El circuito completo

```
Izipay confirma el pago
   → payment-webhook (valida HMAC)
   → settle_paid_order()            ← liquida, acredita saldo, inserta invoices,
                                       publica el aviso si era "pagar y publicar"
   → trigger invoices_dispatch_emission
   → dispatch_invoice_emission()    ← net.http_post a emit-invoice
   → emit-invoice:
        1. emitirEnSunat()          ← claim → construirComprobante → send|resend
        1-bis. emitirNotaDeCredito()← solo si hay una nota pendiente
        2. enviarCorreo()           ← PDF+XML oficiales si está declarado
```

**Red de seguridad**: `sweep_invoice_emissions()` por cron **cada 10 minutos**
recoge lo que quedó pendiente (emisión, nota o correo). Sin ese cron todo el
mecanismo de reintentos es decorativo — estuvo sin programar mucho tiempo.

### Reintentos

- Backoff `3^n` minutos con tope de 1 hora, hasta **60 intentos**.
- **Esperar en su cola NO gasta intento** (`p_espera` devuelve el contador).
- El corte real lo pone **la fecha**: `expire_stale_invoices(3)` marca vencido lo
  que pase de 3 días (el plazo de SUNAT). `DIAS_DE_PLAZO` en el TS **tiene que
  coincidir** con el de `claim_invoice_emission`; estuvieron descuadrados (5 vs 3)
  y el efecto era que el comprobante se quedaba mudo en `pendiente` para siempre.
- Las **notas de crédito no pasan por ese plazo**: se anulan comprobantes viejos.

---

## 6. Series

| | Real | Pruebas |
|---|---|---|
| Boleta | `B001` | `B066` |
| Factura | `F001` | `F066` |
| Nota de crédito (boleta) | `BC01` | `BC66` |
| Nota de crédito (factura) | `FC01` | `FC66` |

Viven en `invoice_series`, **en columnas y no en filas**: su PK es el tipo de
comprobante, así que no caben filas nuevas. Numeración con
`update … returning`, **nunca `nextval`**: una secuencia no revierte y dejaría
huecos que hay que justificar ante SUNAT.

> Las pruebas **jamás** deben mover los correlativos reales. Comprobarlo después
> de cualquier cambio: `select id, serie, correlativo from invoice_series`.

---

## 7. El correo

- Si el documento está **declarado**, se adjuntan el **PDF oficial de Factiliza y
  el XML firmado**. El PDF que generamos nosotros solo vale como comprobante
  interno: no lleva el QR ni el hash que SUNAT exige en la representación
  impresa. Y **legalmente el comprobante ES el XML**.
- Si la descarga falla, va el nuestro. Nadie se queda sin comprobante porque su
  servicio de ficheros esté caído.
- **Sale pase lo que pase con SUNAT.** El comprador ya pagó. Antes, un rechazo lo
  dejaba sin nada para siempre.
- La bitácora (`invoice_emission_attempts`, paso `email`) anota **cuál de los dos
  PDF** se mandó.

### Que no caiga en spam

El DNS está bien (`send.coleffe.com` + DKIM → DMARC pasa). Lo que penalizaba era
el correo en sí, y ya está corregido: asunto **sin `[PRUEBA]` delante** (una
etiqueta en corchetes al principio es patrón de spam), **versión en texto plano**
además del HTML (solo-HTML + PDF adjunto tiene la forma de un phishing), y
`reply_to`. Pendiente del lado del usuario: subir DMARC de `p=none` a
`p=quarantine`.

---

## 8. Anular un comprobante

Un documento aceptado por SUNAT **no se borra**: se anula con una **nota de
crédito** (tipo 07, motivo 01 «ANULACION DE LA OPERACION»).

Desde **Admin › Comercial › Boletas → Anular**. Requiere
`has_perm('Pagos y planes','edit')`.

| Caso | Qué pasa |
|---|---|
| Comprobante **declarado** | retira saldo **y** emite la nota ante SUNAT |
| Comprobante **interno** (`omitido`) | retira saldo; no hay nada que anular |
| El usuario **ya gastó** el saldo | se **niega** hasta confirmarlo explícitamente |

- `previsualizar_anulacion(id)` devuelve los números exactos para enseñarlos
  **antes** de confirmar. Anular no puede ser un «¿seguro?» a ciegas.
- El movimiento de saldo es de tipo **`refund`**, no un `spend` negativo:
  `get_credits_spent` suma el valor absoluto de los `spend` y contarlo ahí
  inflaría lo «gastado» por el usuario.
- **El dinero del cobro NO se devuelve por código.** Se hace a mano en el panel
  de Izipay, y el diálogo lo dice.
- Queda en `audit_logs` como `void_invoice`.

### Qué recibe el comprador (0102)

Hasta la 0102 no recibía **nada**: le bajaba el saldo sin explicación y se
quedaba con la boleta original en el correo, ya sin valor. Ahora:

| Pieza | Cuándo | Dónde |
|---|---|---|
| **Aviso in-app** `invoice_voided` | al anular, **siempre** (haya nota o no) | `notify_user` dentro de `anular_comprobante` |
| **Correo con la nota** | solo cuando SUNAT la **acepta** | ciclo `nota_email_*` propio |

- El aviso lleva número, motivo, créditos retirados y lo que quedó sin
  recuperar; enlaza a *Mis comprobantes*, donde el comprobante sale **Anulado**
  con su motivo y su nota.
- El correo adjunta el **PDF y el XML oficiales de la nota**, descargados de
  `/note/pdf` y `/note/xml` con `tipo_Doc: "07"`. Verificado en vivo.
- **La regla del correo es la CONTRARIA a la del comprobante.** Aquel sale pase
  lo que pase; el de la nota espera a que sea válida — anunciar una nota que
  SUNAT rechazó es anunciar un documento que no existe. Si la descarga del PDF
  falla, se reintenta dos veces y a la tercera sale el correo sin adjunto: la
  noticia no puede perderse por un fichero.
- `nota_email_status` nace en `'pendiente'` para **todos** los comprobantes. Lo
  que impide correos fantasma es que la reserva y el barrido exigen además
  `nota_sunat_status in ('aceptado','observado')`, que es null si nadie anuló.
  Si tocas esas condiciones, la prueba que lo caza es *«NO despierta a un
  comprobante normal»*.
- El botón **Reintentar** del panel destraba también la nota y su correo.

---

## 9. Diagnóstico

```bash
# ¿El token vale para facturación? Compara las DOS APIs. No emite nada.
curl -X POST "$SUPABASE_URL/functions/v1/emit-invoice" \
  -H "x-worker-secret: $INVOICE_WORKER_SECRET" -H "Content-Type: application/json" \
  --data '{"probe":true}'

# ¿El correo llegó de verdad? 'enviado' solo significa que Resend lo ACEPTÓ.
curl -X POST "$SUPABASE_URL/functions/v1/emit-invoice" \
  -H "x-worker-secret: $INVOICE_WORKER_SECRET" -H "Content-Type: application/json" \
  --data '{"email_status_id":"<id de invoices.email_message_id>"}'
```

```sql
-- Estado de todo lo emitido
select number, sunat_status, email_status, es_prueba, anulado_at, nota_number,
       left(coalesce(sunat_last_error,'-'), 80)
  from invoices order by issued_at desc limit 20;

-- Qué se mandó y qué contestaron, íntegro
select step, http_status, ok, request, response
  from invoice_emission_attempts a
  join invoices i on i.id = a.invoice_id
 where i.number = 'B066-000021' order by a.created_at;

-- Que el barrido siga programado
select jobname, schedule from cron.job;
```

---

## 10. Archivos

| Qué | Dónde |
|---|---|
| Construcción e interpretación (puro, sin red) | `supabase/functions/_shared/factiliza.ts` |
| El worker | `supabase/functions/emit-invoice/index.ts` |
| PDF interno | `supabase/functions/_shared/comprobante-pdf.ts` |
| Series y estados | `supabase/migrations/0082_invoice_series.sql` |
| Cola, reservas y reintentos | `0083_invoice_emission.sql` |
| Modo pruebas y series separadas | `0098` · `0099` |
| Reintentos que aguantan el plazo | `0100` |
| Anulación y notas de crédito | `0101` |
| Aviso al comprador y correo de la nota | `0102` |
| Panel | `src/pages/admin/AdminCommercial.tsx` · `src/lib/admin.ts` |
| Vista del comprador | `src/pages/advertiser/AdvertiserInvoices.tsx` · `src/components/InvoiceDetailDialog.tsx` |
| Despliegue y estado detallado | `supabase/functions/emit-invoice/DEPLOY.md` |

Pruebas: `src/test/factiliza.test.ts` (168 casos, incluida toda la matriz de
precios al céntimo) y `migration0082/0083/0098/0101/0102.test.ts` sobre Postgres
real.

---

## 11. Cómo trabajar aquí

1. **Prueba contra su API antes de escribir código.** Cada cosa de este documento
   que se dio por supuesta salió mal; cada una que se probó, salió bien.
2. **Nunca emitas con un comprobante real para probar.** Usa el RUC emisor
   inexistente, o las series de pruebas.
3. **Comprueba los correlativos reales después de tocar nada.**
4. Desplegar: `supabase functions deploy emit-invoice --no-verify-jwt
   --project-ref prhbgniwymaaevnisyov` (hace falta `SUPABASE_ACCESS_TOKEN`).
5. Migraciones: se aplican por la Management API de Supabase
   (`POST /v1/projects/{ref}/database/query`) — en este proyecto no hay
   service_role key a mano ni `db push`.
6. **Sube `APP_VERSION`** en `src/lib/version.ts` en cada despliegue.
