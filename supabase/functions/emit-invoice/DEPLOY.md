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

## Emisión ante SUNAT (Factiliza)

Va **apagada** por defecto. Encenderla es una decisión explícita:

```sql
update public.system_settings set value = 'true'::jsonb
 where key = 'invoice_emission_enabled';
```

Mientras esté apagada, cada comprobante nace como `sunat_status = 'omitido'` con
el motivo escrito, se ve en la app como documento interno y el correo sale igual.

```bash
# El token es el MISMO que usa verify-doc para consultar DNI/RUC.
supabase secrets set FACTILIZA_TOKEN="..."          # normalmente ya está puesto
supabase secrets set EMISOR_RUC="20123456789"       # el RUC dado de alta en Factiliza
supabase secrets set EMISOR_NOMBRE="Razón social"

# Entorno. Por defecto apunta a PRUEBAS: emitir de verdad tiene que ser
# deliberado, no lo que pasa por olvidar una variable.
supabase secrets set FACTILIZA_INVOICE_URL="https://apife-qa.factiliza.com/api/v1/invoice/send"
```

### ✅ FUNCIONANDO EN PRUEBAS — configuración vigente (2026-08-15)

La emisión está **encendida para las compras de PRUEBA** y apagada para las
reales. Dos interruptores, y hacen falta los dos para que un cliente reciba un
comprobante declarado:

| Ajuste (`system_settings`) | Valor hoy | Qué hace |
|---|---|---|
| `invoice_emission_enabled` | **true** | Interruptor maestro |
| `invoice_emission_live` | **false** | Además, emitir las compras REALES |

Con `live` apagado, una compra real genera su comprobante interno de siempre
(`sunat_status = 'omitido'`, serie B001/F001, correo normal). **Los clientes no
notan nada.** Las de prueba van por sus propias series **B066/F066**, así que no
queman correlativos de las reales — un correlativo saltado hay que justificarlo
ante SUNAT.

Una compra es «de prueba» si la liquidó el simulador
(`payment_provider = 'simulado'` o `payment_ref = 'SIMULADO'`), y queda marcada
en `invoices.es_prueba`. Ese dato viaja hasta el PDF y el correo, que avisan de
que el documento no tiene valor fiscal. Va por comprobante y **no por entorno**,
a propósito: si dependiera de a qué host apunta la función, un cliente real con
su comprobante interno recibiría un correo diciéndole que es una prueba.

**Verificado de punta a punta el 2026-08-15**, contra Factiliza y SUNAT de verdad:

| Prueba | Resultado |
|---|---|
| Boleta de prueba (`B066-000021`) | **aceptada** por SUNAT · correo enviado |
| Factura de prueba (`F066-000021`) | **aceptada** por SUNAT · correo enviado |
| Compra de saldo por el simulador (`B066-000022`) | aceptada · correo enviado |
| Pagar y publicar (`B066-000023`) | aviso publicado · aceptada · correo enviado |
| Compra REAL con `live` apagado | `omitido`, serie B001, correo normal — **sin cambios** |
| Importe simulado vs. real (misma configuración) | **23.42 = 23.42** |
| Comprobante rechazado por SUNAT | **el correo salió igual** (antes no salía nunca) |

Secrets vigentes:

```bash
FACTILIZA_INVOICE_TOKEN   # el de facturación (AD360). SEPARADO de FACTILIZA_TOKEN,
                          # que es el de consultas y lo usa verify-doc: son productos
                          # distintos y cada uno da 401 en la API del otro.
FACTILIZA_INVOICE_URL="https://apife-qa.factiliza.com/api/v1/invoice/send"
EMISOR_RUC_PRUEBAS="10749283781"   # en QA el emisor de alta es el de Factiliza
EMISOR_RUC                          # el de Coleffe, intacto: es el de los reales
```

**Para pasar a producción**, cuando Factiliza dé de alta el RUC de Coleffe:
cambiar `FACTILIZA_INVOICE_URL` al host de producción, poner
`invoice_emission_live = true` y comprobar que `EMISOR_RUC` es el nuestro.

### ✅ Cómo se desbloqueó (2026-08-15)

Factiliza levantó QA. **Ya emitimos de verdad contra SUNAT** (en su entorno DEMO)
con el código de este repositorio, sin tocar una línea:

```
POST https://apife-qa.factiliza.com/api/v1/invoice/send
→ 200 · success: true
  "DEMO - El documento fue registrado en el sistema y se encuentra declarado
   correctamente validado en la SUNAT!"

Y así lo lee nuestro leerRespuesta():
  desenlace : "aceptado"
  cdr.code  : "0"
  cdr.description: "La Boleta numero B066-2, ha sido aceptada"
```

Probado con **boleta (B066)** y con **factura (F066)**; las dos aceptadas, las
dos con su CDR firmado. El comprobante lo generó `construirComprobante`, no un
JSON escrito a mano, así que lo verificado es el código que va a producción.

**Lo que hay que saber para configurarlo:**

- **El token bueno es el de AD360**, el que ya teníamos. En producción daba 401
  porque allí no está dado de alta; en QA autoriza. El otro token (el corto)
  sigue sin servir: su firma no la reconocen ni en QA.
- **En QA el RUC emisor es `10749283781`**, el que nos dieron. El de Coleffe
  (`20616009061`) **no está vinculado** a ese usuario: devuelve
  `"Su usuario no se encuentra configurado para el RUC '20616009061'"`. Es lo
  normal en un entorno compartido, pero significa que `EMISOR_RUC` en pruebas
  **no** puede ser el nuestro.
- **QA solo expone dos rutas**: `/api/v1/invoice/send` y `/api/v1/summary/send`.
  `/invoice/cdr` da 404 allí, así que la consulta de un comprobante ya enviado
  **no se puede probar en QA** — solo existe en producción.

```bash
# Configuración para PRUEBAS
supabase secrets set FACTILIZA_TOKEN="<el token de AD360>"
supabase secrets set EMISOR_RUC="10749283781"       # el de QA, NO el de Coleffe
supabase secrets set FACTILIZA_INVOICE_URL="https://apife-qa.factiliza.com/api/v1/invoice/send"
```

```sql
-- Series de pruebas que nos indicaron (volver a B001/F001 en producción)
update invoice_series set serie = 'B066' where tipo = 'boleta';
update invoice_series set serie = 'F066' where tipo = 'factura';
```

**Lo que queda para producción**, y es lo único: que Factiliza dé de alta el RUC
de Coleffe (`20616009061`) con su certificado, y nos confirme el token y la URL
de producción. La integración en sí ya está demostrada.

### Higiene: 7 facturas antiguas con número de boleta

Hay 7 comprobantes de tipo `factura` numerados en la serie de boletas
(`B001-000019`, `B001-000035`, `B001-000038`, `B001-000039`, `B001-000041`,
`B001-000043`, `B001-000066`). Son anteriores a la migración 0082, cuando la
numeración no distinguía serie por tipo.

**No hay problema fiscal**: están todos en `omitido`, así que nunca se
declararon a SUNAT. Se dejan como están —reescribir números de comprobante es
peor que convivir con ellos— pero conviene saberlo antes de asustarse al verlos
en el panel.

### ⚠️ Histórico: lo que bloqueó la emisión hasta el 2026-08-15

**1. El token que tenemos no cubre facturación.** Factiliza vende dos productos
distintos con tokens distintos, y `FACTILIZA_TOKEN` es el de *consultas*. Medido
con la sonda de abajo, el mismo token contra las dos APIs:

| API | Endpoint | Respuesta |
|---|---|---|
| Consultas (DNI/RUC) | `api.factiliza.com/v1/ruc/info/…` | **200 OK** |
| Facturación | `apife.factiliza.com/api/v1/invoice/cdr` | **401** |

No está caducado —la primera responde— simplemente no sirve para emitir. **Hay
que pedirle a Factiliza el token de la API de facturación.**

**2. El entorno de pruebas de su documentación no está sirviendo.** Todas sus
rutas devuelven 404, incluida `/health`, y contesta Cloudflare sin llegar al
origen; el otro host responde 401 (o sea, la aplicación está detrás):

| Host | Cualquier ruta | Quién contesta |
|---|---|---|
| `apife-qa.factiliza.com` | **404** | `Server: cloudflare` |
| `apife.factiliza.com` | **401** | `Server: Kestrel` |

Así que al pedir el token de facturación conviene preguntar también **con qué
URL se prueba**, porque la documentada no está en pie y la que responde es la de
producción, donde un envío aceptado es un documento fiscal de verdad.

Mientras tanto el valor por defecto se deja en el de QA **aunque falle**: así la
emisión falla **cerrada** en vez de emitir sin querer.

### Histórico: las credenciales del 2026-08-12 (ya resuelto)

Factiliza mandó unas credenciales nuevas «del API de Facturación», con RUC
`10749283781`, series recomendadas F066/B066 y la misma URL de pruebas. Se
probaron con consultas de **solo lectura** (preguntan si un comprobante existe;
no emiten nada):

| Prueba | Resultado |
|---|---|
| Token nuevo → `apife-qa.factiliza.com/api/v1/invoice/cdr` (el de su documentación) | **404** — Cloudflare, sin llegar al origen |
| Token nuevo → `apife.factiliza.com/api/v1/invoice/cdr` (el que sí responde) | **401** |
| Token nuevo → `api.factiliza.com/v1/ruc/info/…` (consultas) | **401** |
| `apife-test`, `apifeqa`, `apidemo`, `apife-dev` | el DNS no resuelve |

**Matiz importante, medido después:** ese 401 es contra el host de PRODUCCIÓN, y
las credenciales son explícitamente de PRUEBAS. Que un token de pruebas no valga
en producción es lo esperable, así que **no prueba que el token esté mal**. Lo
que sí está probado es que el entorno de pruebas no existe en ningún sitio
alcanzable:

| Medida | Resultado |
|---|---|
| DNS de `apife-qa.factiliza.com` | **172.67.188.47** → un rango de Cloudflare |
| DNS de `apife.factiliza.com` y `api.factiliza.com` | **178.128.157.236** → su servidor real |
| Cualquier ruta de `apife-qa` vía Cloudflare | **404**, cuerpo vacío |
| Su servidor real con `Host: apife-qa.factiliza.com` (saltándose Cloudflare) | **404** |

Es decir: el nombre de QA apunta a Cloudflare, Cloudflare no tiene origen
configurado para él, y la aplicación tampoco atiende ese nombre en el servidor
donde sí viven los otros dos. **La aplicación de QA no está desplegada.**

Y que el problema no es de cabeceras se comprobó mandando el token de seis
formas distintas (`Bearer`, sin prefijo, `x-api-key`, `apikey`, `Token`, y sin
cabecera): las seis dan lo mismo.

Que la ruta existe y la petición llega también está medido: con el cuerpo vacío
la API responde **400 con la lista de campos que faltan**
(`DCImprimirDTO ... missing required properties: tipo_Doc, serie, correlativo,
empresa_Ruc`), mientras que una ruta inventada da 404. La validación corre antes
que la autenticación.

Dos datos más, por si ayudan a que lo resuelvan de su lado:

- El token es un JWT y su contenido se lee sin secreto. Dentro pone
  `name: AD360`, `email: licencias@autodeal360.com` y **`role: consultor`**:
  parece de otro cliente y con rol de consultas, no de emisión.
- El RUC `10749283781` es de persona natural y no es el de Coleffe
  (`20616009061`). Encaja con un entorno de pruebas compartido, pero conviene
  confirmarlo.

**Qué pedirles, en concreto:**

> No podemos probar las credenciales porque **el entorno de pruebas no responde**.
>
> `apife-qa.factiliza.com` resuelve a Cloudflare (172.67.188.47) y devuelve 404 en
> todas sus rutas, incluida la de su documentación
> (`/api/v1/invoice/send`). Fuimos también directos a su servidor
> (178.128.157.236) con la cabecera `Host: apife-qa.factiliza.com`, saltándonos
> Cloudflare, y **también da 404**: la aplicación de QA no atiende ese nombre.
>
> El mismo token contra `apife.factiliza.com` da 401, pero eso es lo esperable
> siendo credenciales de pruebas contra producción, así que no nos dice nada.
>
> ¿Pueden **levantar el entorno de pruebas**, o darnos la URL que esté operativa?
> Todo lo demás lo tenemos listo: el comprobante que generamos ya cuadra campo por
> campo con su documentación.

### ✅ Nuestro comprobante YA lo acepta su API (verificado el 2026-08-12)

No se quedó en comparar con la documentación: se mandó el comprobante que genera
`construirComprobante` a su API de facturación **de verdad**.

Se puede hacer sin riesgo porque su API **valida el cuerpo ANTES de comprobar el
token**, así que con un token que no vale es imposible emitir nada: la petición
muere en el 401 sin llegar a procesarse.

Y que la prueba discrimina está comprobado con dos controles:

| Enviado a `POST /api/v1/invoice/send` | Respuesta |
|---|---|
| Nuestro comprobante **sin `detalle`** | **400** — «One or more validation errors occurred» |
| Nuestro comprobante **sin `serie` ni `correlativo`** | **400** — ídem |
| **Nuestro comprobante íntegro** | **401** — pasó la validación, solo falta el token |

O sea: si la forma estuviera mal, responderían 400 diciendo qué campo falla. Dan
401, que en este orden significa **«te entendí, pero no te conozco»**.

Queda una sola incógnita, y no es de forma sino de contenido: que SUNAT acepte
los importes y la firma. Eso solo se sabe emitiendo de verdad, con un token
bueno y en un entorno de pruebas que responda.

### Los dos tokens fallan por motivos DISTINTOS (medido el 2026-08-13)

Repitiendo las pruebas mirando las **cabeceras** de la respuesta, y no solo el
código, aparece una diferencia que antes se pasó por alto:

| Token | Respuesta a `POST /api/v1/invoice/send` |
|---|---|
| `…eyJzdWIiOiI0MTMxNSJ9…` (el corto) | 401 + `WWW-Authenticate: Bearer error="invalid_token", error_description="The signature key was not found"` |
| El de AD360 (`role: consultor`) | 401 «pelado», **sin** `WWW-Authenticate` |

**«The signature key was not found» significa que ese token está firmado con una
clave que su servidor de facturación no conoce**: no es un token de este
producto, ni siquiera caducado. Descartado del todo.

El de AD360, en cambio, **sí pasa la comprobación de firma** — se demuestra
porque con él la validación del cuerpo llega a ejecutarse (devuelve 400 con la
lista de campos), cosa que con el corto nunca ocurre: muere antes, en el 401.
O sea que el token de AD360 es auténtico y lo reconocen; lo que le falta es el
**permiso de emisión**.

Su 401 trae un `traceId` (p. ej.
`00-25df25f4b59f00aa0e4a143ce53e1002-66868b0e7cbf3f8c-00`), que ellos pueden
buscar en sus logs para ver qué regla nos rechaza. Vale la pena dárselo.

**Detalle de formato confirmado por su propio validador:** `tip_Afe_Igv` va como
**cadena** (`"10"`), no como número; mandarlo numérico da
`The JSON value could not be converted to System.String`. Nuestro
`construirComprobante` ya lo manda como cadena (`AFECTACION_GRAVADO = "10"`), así
que no hay nada que corregir — pero queda anotado porque es un error fácil de
cometer al reescribirlo.

### Lo que YA está listo para el día que funcione

Su documentación nueva (`factiliza.gitbook.io/api-docs/apis/api-sunat-facturacion`)
confirma que el comprobante que construimos **ya es correcto**: comparado campo
por campo con su ejemplo, `construirComprobante` emite `tipo_Operacion`,
`estado_Documento`, `manual`, `id_Base_Dato`, `detalle` con `factor_Icbper`,
`forma_pago` y `legend` con el código 1000. **No hay que tocar código.**

Las series que recomiendan tampoco son código: viven en una tabla. Para el
entorno de pruebas basta con esto (y volver a B001/F001 al pasar a producción):

```sql
-- Series del entorno de pruebas de Factiliza.
update public.invoice_series set serie = 'F066' where id = 'factura';
update public.invoice_series set serie = 'B066' where id = 'boleta';
```

Y el RUC emisor de pruebas va por secreto, sin desplegar nada:

```bash
supabase secrets set EMISOR_RUC="10749283781"      # solo para pruebas
supabase secrets set FACTILIZA_TOKEN="<el que funcione>"
supabase secrets set FACTILIZA_INVOICE_URL="<el host que responda>/api/v1/invoice/send"
```

Con eso puesto, la sonda de abajo (`{"probe":true}`) dice en un segundo si ya se
puede emitir, **sin poner ningún documento en circulación**.

### Comprobar credenciales sin emitir nada

La función trae una sonda de solo lectura: consulta un comprobante y devuelve lo
que conteste Factiliza. No pone en circulación ningún documento ni consume
correlativo.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/emit-invoice" \
  -H "x-worker-secret: $INVOICE_WORKER_SECRET" \
  -H "Content-Type: application/json" -d '{"probe":true}'
```

Devuelve el código de las dos APIs y un diagnóstico, porque un 401 en
facturación significa cosas distintas según lo que conteste la de consultas:
si esta va bien, el token no cubre facturación; si fallan las dos, el token no
vale.

### Lo que dice su documentación, y que ya está resuelto en el código

- **⚠️ CORRECCIÓN (2026-08-12).** Aquí decía que su API no tenía endpoint de
  resumen diario. **Era falso**: lo saqué de `docs.factiliza.com/llms.txt`, que
  es una web suya distinta y más pobre. En la buena
  (`factiliza.gitbook.io/api-docs`) sí existe:
  `POST /api/v1/summary/send` («Declarar en resumen»).

  Lo que su documentación **no** dice es si para las boletas es obligatorio o
  alternativo a `/invoice/send`. Y nos importa mucho, porque casi todas nuestras
  ventas serán boletas a personas naturales. **Hay que preguntárselo.** A favor
  de que baste con `/invoice/send`: su propio ejemplo de respuesta aceptada es
  el CDR de una BOLETA («La Boleta numero BV01-000022, ha sido aceptada»).
- **Sí hay consulta por serie y correlativo.** `POST /invoice/cdr`, `/invoice/pdf`
  y `/invoice/xml` reciben `{empresa_Ruc, tipo_Doc, serie, correlativo}`. Es lo
  que usa la comprobación previa antes de reenviar: si el documento ya existe, no
  se emite otra vez. (En la API de consultas hay además `POST /sunat/cpe`, que
  valida un comprobante suelto.)

### Probar en el entorno de pruebas

1. Enciende el interruptor de arriba.
2. Haz una compra (hoy, con `simulate-payment`). Eso crea el comprobante en
   estado `pendiente` y avisa a esta función.
3. Mira cómo fue, sin adivinar — cada intento queda con su petición y su
   respuesta completas:

```sql
select i.number, i.sunat_status, i.sunat_error_code, i.sunat_last_error,
       a.http_status, a.response
  from public.invoices i
  left join public.invoice_emission_attempts a on a.invoice_id = i.id and a.step = 'sunat'
 order by i.issued_at desc limit 5;
```

4. Para reintentar uno a mano: botón **Reintentar** del panel, o
   `select public.retry_invoice_emission('<id>');`

### Lo que NO se reintenta solo

Un **rechazo** de SUNAT (datos mal) queda con `needs_review = true` y no se
reenvía: repetirlo daría el mismo resultado y quemaría otro correlativo. Un
comprobante que pasa más de **5 días** en cola pasa a `vencido`, también para
revisión: SUNAT rechaza los documentos fuera de plazo y la fecha de emisión se
congela en el primer intento, así que no se puede enviar un mes después con la
fecha vieja.

## Qué pasa si falta algo

| Falta | Consecuencia |
|---|---|
| `RESEND_API_KEY` | El comprobante se marca `email_status = 'omitido'`. Se genera y se ve en la app; no se envía. |
| `INVOICE_WORKER_SECRET` o el de la BD | La base no puede avisar: los comprobantes se quedan en cola y se ven como pendientes en el panel. Nada se pierde. |
| `EMISOR_RUC` / `EMISOR_NOMBRE` | El PDF sale con el nombre por defecto y sin RUC. Y si la emisión ante SUNAT está encendida, el comprobante queda `omitido` con el motivo escrito: no se emite nada a medias. |
| `FACTILIZA_TOKEN` | Igual: `omitido` con el motivo. |

Ninguna de estas ausencias rompe una compra. Es el principio que gobierna todo
el diseño: **la emisión nunca bloquea la acreditación de créditos.** El usuario
ya pagó; si Factiliza, SUNAT o el correo fallan, su saldo entra igual y el
comprobante se reintenta aparte.

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
