# Yape y Plin en eFFe: qué se necesita y qué implica

Documento de decisión · 18 de agosto de 2026

## Resumen

**Con la pasarela que tenemos hoy no se puede.** Yape y Plin existen dentro de Izipay, pero
en una plataforma distinta de la que usa eFFe. Añadirlos no es activar una casilla: es
integrar un segundo medio de cobro, con su propia afiliación, sus propias credenciales, su
propia librería y su propio aviso de pago.

Es un trabajo acotado y de riesgo bajo —el núcleo de saldo, boletas y publicación no se
toca—, pero **no puede empezar hasta que Izipay entregue las credenciales de prueba**.

---

## Qué tenemos hoy

eFFe cobra a través de **Lyra / micuentaweb.pe**, la pasarela heredada (tecnología PayZen)
que Izipay comercializa. La tienda es la 96894874.

| Pieza | Dónde vive |
|---|---|
| Creación del cobro | `create-payment` → `Charge/CreatePayment` de `api.micuentaweb.pe` |
| Formulario de tarjeta | Librería Krypton, servida desde `static.micuentaweb.pe` |
| Confirmación del pago | `payment-webhook`, con firma HMAC-SHA256 |
| Acreditación y publicación | `settle_paid_order` (una sola función, idempotente) |

## Por qué Yape y Plin no entran ahí

Revisado contra la documentación oficial de esa plataforma:

- Su lista de **medios de pago compatibles** con el formulario incrustado son solo
  tarjetas: Visa, Visa Débit, Visa Electron, Mastercard, Mastercard Débit y Maestro.
- Su sección de **medios de pago** solo añade **pagoEfectivo**. No hay billeteras.
- El parámetro `paymentMethods` de su API existe, pero sus valores son de su propio
  catálogo (`CARDS`, `PAYPAL`…). No hay ningún código de Yape.
- El **sitemap completo** de su documentación (2 537 páginas) no contiene ni una sola con
  las palabras "yape" o "plin".
- Su generador de **códigos QR** tampoco sirve de atajo: produce un QR con una URL de su
  propio checkout, no un QR interoperable que las billeteras peruanas puedan leer.

## Dónde sí están

En la plataforma nueva de Izipay, **Izipay Checkout (Web-Core)**.

| | Yape | Plin (Interbank) |
|---|---|---|
| Cómo se cobra | El comprador teclea el código de su app (`payMethod: YAPE_CODE`) | Medio propio del checkout |
| Límite por operación | S/ 2 000 | S/ 5 000 o USD 1 500 |

Un detalle documentado que conviene tener presente: si un comercio tiene **solo** Yape
configurado y el importe supera su límite, el checkout no llega a mostrarse.

Nuestros importes habituales van de S/ 1 a unos S/ 50, así que esos límites no nos afectan.

## Qué hace falta de Izipay (antes de escribir código)

1. **Afiliación a Izipay Checkout** con el mismo RUC. Hay que preguntar expresamente si
   puede convivir con la tienda de micuentaweb que ya opera, o si implica migrar.
2. **Credenciales de prueba (sandbox)**: código de comercio, clave del botón de pago,
   clave de firma y clave pública RSA.
3. **Tabla de comisiones** de Yape y Plin, que no está publicada. Es lo que decide si el
   medio se ofrece para importes pequeños.

## Qué cambiaría en nuestro sistema

### Lo que NO se toca

El saldo, las boletas de Factiliza, la publicación del aviso y la conciliación de pagos
quedan exactamente igual. El pago nuevo entra por el mismo sitio que el actual: la función
`settle_paid_order`, que ya es idempotente y ya sabe acreditar, emitir y publicar.

### Lo que hay que construir

| Partida | Qué es |
|---|---|
| Alta de la orden | Una Edge Function que pida el token de sesión a Izipay y arme su configuración. El cálculo del importe se reutiliza tal cual: ya vive en el servidor. |
| Pantalla de pago | Un componente nuevo que cargue su SDK, conviviendo con el formulario de tarjeta actual. El usuario elige: tarjeta o Yape/Plin. |
| Aviso de pago | Un webhook nuevo: su firma es distinta (cuerpo en base64 + firma aparte, en vez de HMAC sobre el cuerpo). Termina llamando a la misma `settle_paid_order`. |
| Distinguir el origen | La columna `orders.payment_provider` ya existe; basta un valor nuevo. |
| Conciliación | La verificación contra la pasarela que ya se hizo para las órdenes colgadas hay que replicarla contra la API nueva. |
| Pruebas | Sandbox, y después un cobro real de S/ 1 con cada medio. |

## Esfuerzo estimado

Suponiendo credenciales de sandbox ya entregadas y funcionando:

| Partida | Estimación |
|---|---|
| Alta de la orden y token de sesión | 1 día |
| Pantalla de pago y elección de medio | 1,5 días |
| Webhook y validación de firma | 1 día |
| Conciliación y pruebas en sandbox | 1 día |
| Prueba real y ajustes | 0,5 días |
| **Total** | **5 días de trabajo** |

Fuera de esa cuenta quedan los tiempos de Izipay: la afiliación y la entrega de
credenciales no dependen de nosotros y suelen ser el tramo más largo.

## Riesgos

- **La afiliación se demora.** Es el riesgo principal y el que marca la fecha.
- **Convivencia de las dos plataformas.** Si Izipay obliga a migrar en vez de sumar, el
  trabajo crece: habría que mover también el cobro con tarjeta y rehacer la conciliación.
- **Comisiones.** Si la comisión de la billetera es fija y alta, cobrar S/ 1 por ese medio
  puede no tener sentido; convendría un importe mínimo distinto para Yape/Plin.

## Recomendación

Escribir al asesor comercial de Izipay pidiendo tres cosas concretas: alta en Izipay
Checkout, credenciales de sandbox, y la tabla de comisiones de Yape y Plin. Con eso en
mano, la integración son cinco días de trabajo con el resto del sistema intacto.

---

### Fuentes

- Medios de pago compatibles (micuentaweb): `secure.micuentaweb.pe/doc/es-PE/rest/V4.0/javascript/redirection/compatible_payment_method.html`
- Seleccionar los medios de pago: `secure.micuentaweb.pe/doc/es-PE/rest/V4.0/javascript/redirection/custom_filter.html`
- Pagar con código QR: `secure.micuentaweb.pe/doc/es-PE/rest/V4.0/api/kb/create_qr_code.html`
- Pagar con Yape (Izipay Web-Core): `developers.izipay.pe/web-core/use-cases/pay_with_yape_code/`
- Medios y límites: `developers.izipay.pe/web-core/use-cases/pay/`
- Inicio rápido Web-Core: `developers.izipay.pe/web-core/quickstart/`
- Servicio de notificaciones: `developers.izipay.pe/web-core/notifications/`
- Afiliación: `developers.izipay.pe/getting-started/`
