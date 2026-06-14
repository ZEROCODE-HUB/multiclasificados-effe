
## Objetivo
Elevar la plataforma a una experiencia de marketplace premium y consistente (desktop + móvil), eliminando el concepto de "modos" y unificando el branding **EFFE / Multiclasificados**.

---

## 1. Branding global — EFFE + Multiclasificados
- Logo del header pasa a un bloque de dos líneas:
  - Línea 1 (pequeña, uppercase, tracking ancho): `MULTICLASIFICADOS`
  - Línea 2 (grande, peso 800): `EFFE`
- Mismo tratamiento (más grande) en el título del Hero: `MULTICLASIFICADOS` arriba, `EFFE — PERÚ` debajo.
- Componente reutilizable `BrandMark` para mantener consistencia.

## 2. Header & top bar
- **Eliminar** la franja superior "Enviando a Lima, Perú · …" del `Navbar`.
- Solo queda el header blanco principal.
- Input de búsqueda del header: bordes rectos (`rounded-none`) en lugar de pill, coherente con el lenguaje cuadrado del resto.

## 3. Hero (landing)
- Tipografía `MULTICLASIFICADOS / EFFE — PERÚ` más grande y jerárquica.
- En desktop: layout **2 columnas** — texto + buscador a la izquierda, imagen visual (mockup/foto categoría) a la derecha para balancear. En móvil, una sola columna.
- Reducir ligeramente el overlay para que se vea más la imagen de fondo.
- Más aire vertical (padding superior/inferior) para sensación premium.

## 4. Sección "Por qué elegirnos"
- Rediseñar las 3 tarjetas: layout con ícono en contenedor cuadrado con gradiente sutil, mejor tipografía, divisor de color, hover refinado.
- Cambiar íconos genéricos por un set más distintivo (p. ej. `BadgeCheck`, `Sparkles`/`Gem`, `Headset`) con tratamiento custom (badge cuadrado, fondo degradado primary→secondary).
- Quitar las píldoras "Nuevo · Próximamente" de la sección Mapa del landing.

## 5. "Donde los negocios suceden"
- Tratamiento más premium: tipografía display más fina, kicker uppercase, subrayado/decorador sutil, mejor jerarquía y respiración.

## 6. Tarjetas cuadradas en TODO el producto
- Auditar y reemplazar usos de tarjetas redondeadas por `ListingCard` (estilo cuadrado actual del landing) en:
  - `SeekerDashboard`, `SeekerSearch`, `SeekerFavorites`
  - `AdvertiserDashboard`, `AdvertiserListings`
  - Variante móvil de `ListingCard` y `ListingRow` también con `rounded-none`.
- Revisar `Card` base donde se use para listados y aplicar override sin radius.

## 7. Eliminar "Modo Buscador / Modo Anunciante" — perfil único
- Quitar el switch de rol del dropdown "Mi Cuenta" y del `useSession` (queda un solo usuario logueado).
- **Home post-login** = versión personalizada de la landing pública (hero más compacto + grilla de avisos + categorías), no el dashboard.
- Rutas:
  - `/` después de login muestra la experiencia de exploración personalizada.
  - Mantener como áreas de gestión independientes accesibles desde "Mi Cuenta":
    - **Mis avisos** (publicaciones)
    - **Mis postulaciones**
    - **Mensajes**
    - **Favoritos / Búsquedas guardadas**
    - **Panel y estadísticas** (fusión del antiguo "Mi panel" — resumen compacto arriba + ítems debajo)
    - **Configuración**
- Eliminar `SeekerDashboard` y `AdvertiserDashboard` como pantallas de aterrizaje; redirigir a `/` o a su sección de gestión correspondiente.
- Admin / Superadmin **no se tocan** (mantienen su sidebar y experiencia).

## 8. Panel y estadísticas (refactor)
- Renombrar "Mi panel" → **Panel y estadísticas**.
- Stat cards más pequeñas y compactas (resumen de una fila), debajo los ítems (avisos / actividad) con las tarjetas cuadradas premium.

## 9. Mobile parity & padding
- Todas las decisiones estructurales de desktop se replican en móvil (tarjetas cuadradas, branding, jerarquía).
- Reducir el padding lateral excesivo en vistas de gestión móvil: secciones como "Mis avisos recientes" salen del contenedor blanco — el título queda como `h2` fuera, y las tarjetas usan el ancho disponible con un margen lateral pequeño (`px-3`/`px-4`), sin envoltura tipo `Card` alrededor de la lista.
- Bottom nav y hamburguesa **se mantienen** en móvil; top nav se mantiene en desktop.

---

## Detalles técnicos

### Archivos a crear
- `src/components/BrandMark.tsx` — logo Multiclasificados/EFFE reutilizable.
- `src/components/PostLoginHome.tsx` — home personalizada post-login (reusa secciones del Index).
- `src/components/SectionHeader.tsx` (opcional) — título de sección fuera-de-contenedor para móvil.

### Archivos a editar
- `src/components/Navbar.tsx` — eliminar top bar, input rectangular, BrandMark, quitar switch de rol del dropdown, ajustar items de "Mi Cuenta".
- `src/components/HeroSearch.tsx` (o donde esté el hero) — nueva tipografía + layout 2 col + overlay reducido + más padding.
- `src/pages/Index.tsx` — sección "Por qué elegirnos" rediseñada; quitar pills "Nuevo · Próximamente"; pulir "Donde los negocios suceden".
- `src/components/ListingCard.tsx` — asegurar `rounded-none` y consistencia variant list (móvil) sin radios.
- `src/components/ListingRow.tsx` — alinear estilo cuadrado.
- `src/components/DashboardLayout.tsx` — reducir paddings móvil (de `px-4` excesivo a `px-3`), permitir secciones fuera de contenedor.
- `src/pages/SeekerDashboard.tsx` y `AdvertiserDashboard.tsx` — convertir en redirects a `/` (home post-login) o fusionar con "Panel y estadísticas".
- `src/pages/advertiser/AdvertiserListings.tsx`, `seeker/SeekerFavorites.tsx`, `seeker/SeekerSearch.tsx` — sacar el grid del `Card`, usar `ListingCard` cuadrado, título fuera del contenedor en móvil.
- `src/App.tsx` — ajustar `/` para servir `PostLoginHome` cuando hay sesión; quitar/redirigir rutas de dashboards si aplica.
- `src/hooks/useSession.ts` — quitar concepto de cambio de rol (usuario único).

### No tocar
- Admin / Superadmin (`AdminLayout`, rutas `/dashboard/admin/*`, `/dashboard/superadmin/*`).
- Lógica de backend (es solo frontend por ahora).

---

¿Procedo con la implementación completa o quieres ajustar algún punto antes?
