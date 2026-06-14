## Objetivo
Profesionalizar el panel administrativo (estilo CRM), pulir landing/hero, simplificar navegación móvil y corregir comportamientos varios.

---

## Panel administrativo (admin + superadmin)

### 1. Gestión de avisos (`AdminListings`)
- Banner/toast de confirmación al **aprobar** (igual que rechazo).
- Habilitar ícono **ojo** → abrir `Dialog` con todos los detalles del aviso (título, descripción, categoría, ubicación, precio, anunciante, fechas, imágenes, estado).
- Tabla con **paginación**, búsqueda y filtros visibles (look CRM).
- Aplicar mismos cambios en la vista equivalente del superadmin (compartir componente).

### 2. Gestión de usuarios (`AdminUsers`)
- Acción **activar/suspender** abre `AlertDialog` de confirmación antes de ejecutar.
- Paginación + filtros consistentes.

### 3. Configuración comercial (`AdminCommercial`)
- **Categorías**: botón "Nueva" abre dialog (form simple en estado local), íconos editar/borrar funcionales con confirmación.
- **Planes**: botón "Editar plan" abre dialog editable.
- **Promociones**: "Nueva" funcional + acciones por promoción (activar/desactivar/eliminar) con `AlertDialog` y toast.

### 4. Comunicaciones → submódulo "Conversaciones"
- Mover/duplicar `SuperConversations` como página accesible para admin **bajo Comunicaciones**.
- En superadmin también reordenar para que "Conversaciones" quede bajo "Comunicaciones" en el sidebar.

### 5. Reportes (`AdminReports`)
- Reemplazar tabs por las categorías solicitadas:
  - **Dashboard tiempo real**: avisos gratuitos por categoría; avisos con visibilidad (con total cobrado); gratuitos por región + categoría; con visibilidad por región + categoría (con total cobrado).
  - **Reclamos**: recibidos / pendientes / solucionados con conformidad.
  - **Pagos, Avisos, Usuarios, Postulaciones**: filtrables (rango fechas, categoría, región) y exportables CSV/Excel/PDF.
- Charts con datos mock realistas + filtros en cabecera.

### 6. Comunicaciones masivas (`AdminCommunications`)
- En tab "Masivo" agregar segmentación avanzada para **Buscadores**:
  - Por perfil, por intereses, por ubicación geográfica (región/ciudad), por avisos activos de anunciantes, factores de match.
- Checkbox/auto "Incluir en copia a Administradores y Superadministradores".

### 7. Superadmin → Roles (`SuperRoles`)
- Dejar **solo dos roles**: Superadministrador y Administrador.
- El superadmin define permisos granulares sobre lo que el administrador puede hacer (matriz de permisos editable).
- Eliminar referencias a Moderador y Soporte en UI/datos mock.

### 8. Superadmin → limpiar módulos
- Eliminar página/ruta **Integraciones** (`SuperIntegrations`) y su entrada de sidebar.
- En **Seguridad** (`SuperSecurity`) eliminar: Lista blanca de IPs, Cifrado en reposo, Política de contraseñas, Monitoreo.
- Eliminar también `SuperMonitoring` si ya no se referencia.

---

## Landing & navegación

### 9. Hero (`HeroSearch` / `Index`)
- Título: `Multiclasificados` + `EFFE` (sin "— PERÚ"; "Perú" no en mayúsculas, simplemente quitar el subtítulo país).
- Subir tamaño tipográfico de "Donde los negocios suceden".
- Lado derecho: **un solo card** con métrica "avisos activos" (gráfico/contador). Eliminar el card "100% verificados".
- Quitar pill/kicker "Plataforma profesional · Perú".

### 13. Hero móvil + navegación móvil
- Reducir altura del hero en móvil (menos `min-h`, menos padding vertical).
- `MobileBottomNav` **siempre visible** cuando hay sesión (en todas las rutas excepto `/auth`).
- Menú hamburguesa móvil: mostrar **solo secciones que no estén en el bottom nav** (no listar todas las categorías ni duplicar bottom nav).

### 10. `dashboard/anunciante/configuracion`
- Quitar bloque de notificaciones por completo.

### 11. Alertas (Seeker)
- Eliminar `SeekerAlerts`, su ruta y cualquier link/ícono en navbar, dropdown "Mi Cuenta", bottom nav.

### 12. Búsquedas guardadas (`SeekerSearches`)
- Habilitar botones **Refresh** (re-ejecuta búsqueda, toast) y **Eliminar** (con `AlertDialog` de confirmación + toast).

---

## Nota general: refrescos espontáneos
- Auditar `useSession` y eventos `effe-session`: evitar `setState` redundantes que disparen remount.
- Revisar `<Route>` keys, `useEffect` con dependencias inestables, y cualquier `window.location.href` que debería ser `navigate()` de React Router.
- Asegurar que cambios de localStorage no rerendericen árboles enteros.

---

## Archivos clave
- `src/pages/admin/AdminListings.tsx`, `AdminUsers.tsx`, `AdminCommercial.tsx`, `AdminCommunications.tsx`, `AdminReports.tsx`
- `src/components/AdminLayout.tsx` (añadir ítem "Conversaciones" bajo Comunicaciones)
- `src/pages/superadmin/SuperConversations.tsx`, `SuperRoles.tsx`, `SuperSecurity.tsx`
- Eliminar: `SuperIntegrations.tsx`, `SuperMonitoring.tsx`, `seeker/SeekerAlerts.tsx`
- `src/components/HeroSearch.tsx`, `src/pages/Index.tsx`
- `src/components/MobileBottomNav.tsx`, `src/components/Navbar.tsx` (menú hamburguesa)
- `src/pages/shared/SettingsPage.tsx` (o equivalente anunciante)
- `src/pages/seeker/SeekerSearches.tsx`
- `src/App.tsx` (rutas: quitar alertas, integraciones, monitoreo; añadir conversaciones admin)
- `src/hooks/useSession.ts` (estabilizar)

## Sin tocar
- Backend / persistencia (no hay).
- Lógica de auth real.

¿Procedo con la implementación completa o ajustamos algún punto antes?
