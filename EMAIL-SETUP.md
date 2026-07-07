# Correo del Centro de mensajes — qué falta y por qué

## Estado: TODO listo del lado técnico ✅

| Pieza | Estado |
|---|---|
| Función `send-email` desplegada | ✅ hecho |
| Trigger `notifications_email` (BD → función) | ✅ hecho |
| `RESEND_API_KEY` (proveedor de correo) | ✅ ya existía |
| Pipeline completo probado (entrega real confirmada) | ✅ hecho |
| **Dominio de envío verificado** | ❌ **falta — es lo único** |

El sistema YA envía correos. Ahora mismo solo llegan a `oscarmijael7w7@gmail.com`
(el dueño de la cuenta Resend), porque Resend está en **modo prueba** sin dominio
verificado. En cuanto se verifique un dominio, el correo llega a **cualquier usuario**.

---

## Lo único que necesitas

**Verificar un dominio de envío.** Elige UNA de estas dos formas gratuitas:

### Opción A — Dominio propio en Resend (recomendada)
Requiere: un dominio que controles (p. ej. `coleffe.com`) + acceso a su DNS.
1. https://resend.com/domains → **Add Domain** → tu dominio.
2. Resend te da **3 registros DNS** (SPF, DKIM, return-path). Pégalos en tu DNS.
3. Botón **Verify** (tarda de minutos a horas).
4. Avísame → configuro `EMAIL_FROM="eFFe Clasificados <no-reply@tudominio>"`.

### Opción B — Gmail SMTP (sin dominio, $0)
Requiere: una cuenta `@gmail.com` con verificación en 2 pasos.
1. Google → Seguridad → **Contraseñas de aplicación** → genera una.
2. Me la pasas → cambio `send-email` para enviar por SMTP de Gmail.
- Límite ~500 correos/día y más riesgo de spam en envíos masivos grandes.

---

## Por qué NO se puede hacer "solo con Supabase"

Supabase **no es un proveedor de correo**. Lo único de email que trae es el mailer
de **autenticación** (confirmación de registro, reset de contraseña): solo sirve para
esos correos, está limitado a ~2–4 por hora, y el propio Supabase dice que es "solo
para pruebas" — y para producción te pide conectar un SMTP externo igual.

Para enviar un correo a un usuario **siempre** hace falta un servicio de correo
(Resend, Gmail, SendGrid, SES…). Esto es así en cualquier plataforma, no solo
Supabase: los servidores de correo **rechazan** (o mandan a spam) a quien envía en
nombre de un dominio que no ha demostrado controlar. La verificación del dominio
(los registros DNS) es justamente esa prueba. Sin ella, ningún proveedor entrega a
terceros — es el mecanismo anti-spam de todo el correo de internet.

**Costo:** Resend es gratis (3.000 correos/mes). Verificar el dominio es gratis. Lo
único que a veces cuesta es comprar un dominio (~$12/año), y es $0 si ya tienes uno.

---

## Alternativa sin correo (0 configuración)

Las notificaciones **in-app** (campana dentro de la app) y **push** (al celular en el
APK) **YA funcionan solo con Supabase**, sin proveedor, sin dominio, sin costo. Si no
quieres lidiar con el correo, se puede quitar la casilla de email del Centro de
mensajes y quedarte con in-app + push, que le llegan al usuario igual.
