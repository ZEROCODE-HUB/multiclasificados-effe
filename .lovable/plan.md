# Plan de actualización — MultiClasificados EFFE

Mantengo intactos: roles, navegación, estilo visual y sistema de diseño actuales. Solo se aplican los cambios listados, en los roles indicados.

## 1. Registro unificado (Buscador / Anunciante)
- `src/pages/AuthPage.tsx`: eliminar selector de tipo de cuenta y campos de razón social/RUC/DNI en registro. Dejar únicamente: nombre, correo, teléfono, contraseña (+ aceptación de términos). Mantener botones de demo y login intactos.
- Al registrar, el usuario queda como rol genérico que puede tanto buscar como, al intentar publicar, completar verificación de identidad.

## 2. Flujo de publicación de aviso (Anunciante)
Reescribir `src/pages/advertiser/AdvertiserPublish.tsx` como wizard de un solo archivo con pasos:
1. **Popup inicial** "Persona natural / Persona jurídica" → input DNI o RUC + botón "Verificar" (validación simulada de longitud).
2. **Datos del aviso**: campos actuales (título, categoría, descripción, fotos ordenables ya existentes).
3. **Duración**: select con 3, 7, 15, 30, 60, 90 días.
4. **Extras**: checkboxes Imagen 100kb, Imagen 500kb, PDF 100kb, PDF 500kb, Urgente, Destacado, Confidencial.
5. **Precio dinámico** visible en panel lateral/sticky, recalculado en vivo desde `src/lib/pricing.ts` (nuevo).
6. **Resumen del aviso** con checkbox "Confirmo que la información es correcta".
7. **Pago simulado** → publica automáticamente, genera boleta (sección 9), redirige a "Mis avisos".

Eliminar redirección a `/planes` y el botón "Publicar aviso" del flujo anterior que llevaba a planes. Eliminar la página `src/pages/PlansPage.tsx` y su ruta en `src/App.tsx`. Eliminar cualquier flujo de aprobación previa por administrador.

Nota: la duración 3 días no aparece en la tabla de precios; se calculará proporcionalmente (3/7 del precio de 7 días) usando el mismo motor.

## 3. Motor de precios (`src/lib/pricing.ts` nuevo)
Función pura que recibe `{ cantidadAvisos, dias, extras, settings }` y devuelve precio total.

```text
precio(n, d) = base
             * factorCantidad(n)   // (1 - desc)^(n-1), desc por aviso adicional
             * factorDias(d)       // duplica precio y aplica % por cada salto
```

`settings` proviene de localStorage (`effe:pricing-settings`), valores por defecto:
- base = 16.14
- descPorAviso = 0.06
- saltos = {15:0.14, 30:0.13, 60:0.12, 90:0.11}
- extras = {img100:5, img500:5, pdf100:5, pdf500:5, urgente:10, destacado:15, confidencial:8}

Función auxiliar `buildMatrix(settings)` que genera la tabla 1–10 avisos × {7,15,30,60,90}.

## 4. Módulo de Tarifas (Administrador / Superadministrador)
Nueva página `src/pages/admin/AdminPricing.tsx`:
- Sección "Parámetros": inputs editables (base, % por aviso adicional, % por cada salto de días, precios de cada extra). Guardar en localStorage.
- Sección "Matriz calculada": tabla de 10×5 generada por `buildMatrix`, solo lectura, con badge "calculado automáticamente".
- Sección "Extras": lista editable con precio.

Agregar ruta y entrada en `AdminLayout.tsx` (icono `Tags` o `DollarSign`). Visible para admin y superadmin.

## 5. Conversaciones (Buscador y Anunciante)
- `src/pages/ListingDetail.tsx`: ya tiene "Enviar mensaje" y "Mostrar teléfono" — mantener.
- Verificar que `MessagesPage.tsx` esté enlazado tanto desde el menú del Buscador como del Anunciante (`DashboardLayout.tsx`). Añadir entrada "Conversaciones" en el menú lateral del Anunciante si falta.

## 6. Cierre de venta (Buscador y Anunciante)
- En `MessagesPage.tsx` (vista de conversación) y/o en el detalle del aviso del lado del anunciante, agregar un checkbox "Venta concretada" persistido en localStorage por `listingId`. Ambos lados pueden marcarlo; el aviso se considera vendido cuando ambos lo marcan (o al menos uno, según simulación — usaremos: cualquiera de los dos marca → estado "vendido" para KPIs).

## 7. Moderación
- `ListingDetail.tsx`: agregar botón "Reportar" con popup (motivo) → guarda en `localStorage` lista de reportes.
- `src/pages/admin/AdminListings.tsx`: agregar tab "Reportados" (Tabs shadcn). Acción "Deshabilitar" con popup de motivo → notificación simulada al anunciante (toast + registro local).
- Eliminar cualquier acción "Aprobar/Rechazar" previa a publicación si existe.

## 8. KPIs (Administrador / Superadministrador)
Actualizar `src/pages/admin/AdminDashboard.tsx` para mostrar:
- Total avisos publicados (con filtro por categoría)
- Vendidos / No vendidos (de localStorage de sección 6)
- Reportados (filtrable por categoría)
- Tabla "Detalle por aviso" con comprador/vendedor si fue marcado vendido

## 9. Facturación
- Al confirmar pago en el wizard de publicación, generar registro de boleta (número correlativo, fecha, monto, detalle, correo del anunciante) y guardarlo en localStorage (`effe:invoices`).
- Mostrar toast: "Boleta enviada a {correo}".
- Nueva subpágina simple `src/pages/advertiser/AdvertiserInvoices.tsx` con lista de boletas del anunciante.
- En el panel admin, agregar acceso de solo lectura a las boletas (sub-tab dentro de `AdminCommercial.tsx`).

## Archivos a crear
- `src/lib/pricing.ts`
- `src/pages/admin/AdminPricing.tsx`
- `src/pages/advertiser/AdvertiserInvoices.tsx`

## Archivos a editar
- `src/pages/AuthPage.tsx`
- `src/pages/advertiser/AdvertiserPublish.tsx`
- `src/pages/ListingDetail.tsx`
- `src/pages/admin/AdminListings.tsx`
- `src/pages/admin/AdminDashboard.tsx`
- `src/pages/admin/AdminCommercial.tsx`
- `src/pages/shared/MessagesPage.tsx`
- `src/components/AdminLayout.tsx`
- `src/components/DashboardLayout.tsx`
- `src/components/Navbar.tsx` (quitar enlace a /planes si lo tuviera)
- `src/App.tsx` (rutas: añadir nuevas, eliminar `/planes`)

## Archivos a eliminar
- `src/pages/PlansPage.tsx`

## No tocar
- Sistema de roles existente
- Colores, tipografías, espaciados, componentes UI (shadcn) ya definidos
- Cualquier funcionalidad no descrita en los 9 puntos
