# Edge Function `verify-doc` — Verificación DNI / RUC con Factiliza

Verifica el DNI (persona natural) o RUC (persona jurídica) del anunciante
consultando la API de Factiliza **desde el servidor**. El token de Factiliza
vive como secret en Supabase y nunca se expone al navegador.

## 1) Configurar el token (secret)

El token está en tu panel de Factiliza → sección **Token** (botón "Copiar").

```bash
supabase secrets set FACTILIZA_TOKEN="eyJhbGci...tu-token-completo..."
```

> Pega el token **completo** (empieza con `eyJhbGci`). Es largo; cópialo con el
> botón "Copiar" del panel para no truncarlo.

## 2) Desplegar la función

```bash
supabase functions deploy verify-doc
```

**Sin `--no-verify-jwt`.** La función consulta datos personales (RENIEC: nombre
y domicilio) y cada llamada consume saldo de Factiliza, así que exige una sesión
de usuario. Tampoco basta la anon key: es pública (viaja en el bundle de la web
y del APK) y el código la rechaza explícitamente. Por eso el flujo de publicar
pide login **antes** de verificar el documento.

## 3) Probar en local (opcional)

```bash
# crea supabase/functions/.env con:  FACTILIZA_TOKEN=eyJhbGci...
supabase functions serve verify-doc --env-file supabase/functions/.env
```

## Contrato

Request (POST JSON):

```json
{ "tipo": "dni", "numero": "12345678" }
```

Response OK:

```json
{ "success": true, "tipo": "dni", "numero": "12345678", "nombre": "JUAN PEREZ", "data": { ... } }
```

Response error:

```json
{ "success": false, "error": "No se encontró el documento." }
```

## Endpoints de Factiliza usados

- DNI: `GET https://api.factiliza.com/v1/dni/info/{dni}`
- RUC: `GET https://api.factiliza.com/v1/ruc/info/{ruc}`
- Header: `Authorization: Bearer <FACTILIZA_TOKEN>`
