import { Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, Outlet } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cerrarTecladoAlTocarFuera } from "@/lib/teclado";
import { SupabaseAuthBridge } from "@/components/SupabaseAuthBridge";
import { MaintenanceGate } from "@/components/MaintenanceGate";
import { UpdateGate } from "@/components/UpdateGate";
import { FavoritesProvider } from "@/hooks/useFavorites";
import { RequireRole } from "@/components/RequireRole";
import { StaffHomeRedirect } from "@/components/StaffHomeRedirect";
import { IosSwipeBack } from "@/components/IosSwipeBack";
import { ReconciliadorDePagos } from "@/components/ReconciliadorDePagos";
import { AdminShell } from "@/components/AdminLayout";
import { cargaDiferida } from "@/lib/cargaDiferida";

// Páginas críticas (primer render): se cargan de inmediato.
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import ListingDetail from "./pages/ListingDetail.tsx";

// Resto (panel, admin, gráficas) → carga diferida para aligerar el arranque.
// `cargaDiferida` en vez de `lazy` a secas: tras un despliegue los archivos del
// build anterior desaparecen, y quien tuviera la app abierta se quedaba con un
// "Failed to fetch dynamically imported module" al entrar aquí. Ver
// src/lib/cargaDiferida.ts.
const AdminPricing = cargaDiferida(() => import("./pages/admin/AdminPricing.tsx"));
const AdvertiserInvoices = cargaDiferida(() => import("./pages/advertiser/AdvertiserInvoices.tsx"));
const AdvertiserDashboard = cargaDiferida(() => import("./pages/AdvertiserDashboard.tsx"));
const SeekerDashboard = cargaDiferida(() => import("./pages/SeekerDashboard.tsx"));
const AdvertiserPublish = cargaDiferida(() => import("./pages/advertiser/AdvertiserPublish.tsx"));
const AdvertiserListings = cargaDiferida(() => import("./pages/advertiser/AdvertiserListings.tsx"));
const AdvertiserApplications = cargaDiferida(() => import("./pages/advertiser/AdvertiserApplications.tsx"));
const AdvertiserStats = cargaDiferida(() => import("./pages/advertiser/AdvertiserStats.tsx"));
const SeekerFavorites = cargaDiferida(() => import("./pages/seeker/SeekerFavorites.tsx"));
const SeekerSearches = cargaDiferida(() => import("./pages/seeker/SeekerSearches.tsx"));
const SeekerApplications = cargaDiferida(() => import("./pages/SeekerApplications.tsx"));
const MessagesPage = cargaDiferida(() => import("./pages/shared/MessagesPage.tsx"));
const SettingsPage = cargaDiferida(() => import("./pages/shared/SettingsPage.tsx"));
const AdminDashboard = cargaDiferida(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminListings = cargaDiferida(() => import("./pages/admin/AdminListings.tsx"));
const AdminUsers = cargaDiferida(() => import("./pages/admin/AdminUsers.tsx"));
const AdminCommunications = cargaDiferida(() => import("./pages/admin/AdminCommunications.tsx"));
const AdminCommercial = cargaDiferida(() => import("./pages/admin/AdminCommercial.tsx"));
const AdminReports = cargaDiferida(() => import("./pages/admin/AdminReports.tsx"));
const AdminPagosManuales = cargaDiferida(() => import("./pages/admin/AdminPagosManuales.tsx"));
const SuperRoles = cargaDiferida(() => import("./pages/superadmin/SuperRoles.tsx"));
const SuperAudit = cargaDiferida(() => import("./pages/superadmin/SuperAudit.tsx"));
const SuperConversations = cargaDiferida(() => import("./pages/superadmin/SuperConversations.tsx"));
const NotFound = cargaDiferida(() => import("./pages/NotFound.tsx"));
const ResetPassword = cargaDiferida(() => import("./pages/ResetPassword.tsx"));
const PaymentPage = cargaDiferida(() => import("./pages/PaymentPage.tsx"));

const queryClient = new QueryClient();

/**
 * En el móvil, un toque fuera del campo cierra el teclado, como en cualquier
 * app. Va aquí y no en cada pantalla porque el problema es de toda la app: se
 * escribe en un buscador, llegan los resultados y el teclado sigue tapando
 * media pantalla. No pinta nada.
 */
function CerrarTecladoAlTocarFuera() {
  useEffect(() => cerrarTecladoAlTocarFuera(), []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SupabaseAuthBridge />
      <UpdateGate />
      <CerrarTecladoAlTocarFuera />
      <FavoritesProvider>
      <BrowserRouter>
        {/* Swipe-back desde el borde izquierdo en iOS (no tiene botón físico). */}
        <IosSwipeBack />
        {/* Rescata los pagos que se quedaron sin confirmar (webhook perdido). */}
        <ReconciliadorDePagos />
        {/* Dentro del router: necesita la ruta para dejar pasar /auth/staff. */}
        <MaintenanceGate>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-9 h-9 rounded-full border-[3px] border-muted border-t-secondary animate-spin" /></div>}>
        <Routes>
          <Route path="/" element={<StaffHomeRedirect><Index /></StaffHomeRedirect>} />
          <Route path="/auth" element={<AuthPage />} />
          {/* Login de staff (admin/superadmin): mismo formulario pero CON hCaptcha. */}
          <Route path="/auth/staff" element={<AuthPage requireCaptcha />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* Nueva contraseña: destino del enlace del correo de recuperación. */}
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Página de pago (redirect del APK): se abre en el navegador del
              sistema con el formToken de Izipay. Pública: solo renderiza el
              formulario; el webhook acredita y la app confirma por polling. */}
          <Route path="/pay" element={<PaymentPage />} />
          <Route path="/buscar" element={<SearchPage />} />
          <Route path="/aviso/:id" element={<ListingDetail />} />
          <Route path="/planes" element={<Navigate to="/dashboard/anunciante/publicar" replace />} />
          <Route path="/mapa" element={<Navigate to="/buscar?view=map" replace />} />


          {/* Paneles de usuario (anunciante/buscador): exigen sesión REAL de
              Supabase. Sin sesión válida se redirige al login (así ya no se
              muestran paneles/perfiles vacíos ni identidades fantasma). */}
          <Route element={<RequireRole min="buscador"><Outlet /></RequireRole>}>
            {/* Advertiser */}
            <Route path="/dashboard/anunciante" element={<AdvertiserDashboard />} />
            <Route path="/dashboard/anunciante/publicar" element={<AdvertiserPublish />} />
            <Route path="/dashboard/anunciante/avisos" element={<AdvertiserListings />} />
            <Route path="/dashboard/anunciante/mensajes" element={<MessagesPage role="anunciante" />} />
            <Route path="/dashboard/anunciante/postulaciones" element={<AdvertiserApplications />} />
            <Route path="/dashboard/anunciante/estadisticas" element={<AdvertiserStats />} />
            <Route path="/dashboard/anunciante/configuracion" element={<SettingsPage role="anunciante" />} />
            <Route path="/dashboard/anunciante/boletas" element={<AdvertiserInvoices />} />

            {/* Seeker */}
            <Route path="/dashboard/buscador" element={<SeekerDashboard />} />
            {/* El seeker busca en /buscar (buscador público real); esta ruta vieja
                solo redirige por si quedó algún enlace/marcador. */}
            <Route path="/dashboard/buscador/buscar" element={<Navigate to="/buscar" replace />} />
            <Route path="/dashboard/buscador/favoritos" element={<SeekerFavorites />} />
            <Route path="/dashboard/buscador/busquedas" element={<SeekerSearches />} />
            <Route path="/dashboard/buscador/postulaciones" element={<SeekerApplications />} />
            <Route path="/dashboard/buscador/mensajes" element={<MessagesPage role="buscador" />} />
            <Route path="/dashboard/buscador/alertas" element={<Navigate to="/dashboard/buscador" replace />} />
            <Route path="/dashboard/buscador/configuracion" element={<SettingsPage role="buscador" />} />
          </Route>

          {/* Panel de administración — shell persistente (sidebar/header no se
              remontan al navegar). Entra todo el staff: admin, moderador y
              soporte. Lo que cada uno ve dentro lo recorta la Matriz de permisos
              (get_my_permissions), y lo que puede hacer lo exigen los RPCs. */}
          <Route element={<RequireRole min="soporte"><AdminShell /></RequireRole>}>
            <Route path="/dashboard/admin" element={<AdminDashboard role="admin" />} />
            <Route path="/dashboard/admin/avisos" element={<AdminListings role="admin" />} />
            <Route path="/dashboard/admin/usuarios" element={<AdminUsers role="admin" />} />
            <Route path="/dashboard/admin/comunicaciones" element={<AdminCommunications role="admin" />} />
            <Route path="/dashboard/admin/conversaciones" element={<SuperConversations role="admin" />} />
            <Route path="/dashboard/admin/comercial" element={<AdminCommercial role="admin" />} />
            <Route path="/dashboard/admin/reportes" element={<AdminReports role="admin" />} />
            <Route path="/dashboard/admin/tarifas" element={<AdminPricing role="admin" />} />
            <Route path="/dashboard/admin/yape-plin" element={<AdminPagosManuales role="admin" />} />
          </Route>

          {/* Super Admin — shell persistente, solo rol superadmin */}
          <Route element={<RequireRole min="superadmin"><AdminShell /></RequireRole>}>
            <Route path="/dashboard/superadmin" element={<AdminDashboard role="superadmin" />} />
            <Route path="/dashboard/superadmin/avisos" element={<AdminListings role="superadmin" />} />
            <Route path="/dashboard/superadmin/usuarios" element={<AdminUsers role="superadmin" />} />
            <Route path="/dashboard/superadmin/comunicaciones" element={<AdminCommunications role="superadmin" />} />
            <Route path="/dashboard/superadmin/conversaciones" element={<SuperConversations role="superadmin" />} />
            <Route path="/dashboard/superadmin/comercial" element={<AdminCommercial role="superadmin" />} />
            <Route path="/dashboard/superadmin/reportes" element={<AdminReports role="superadmin" />} />
            <Route path="/dashboard/superadmin/tarifas" element={<AdminPricing role="superadmin" />} />
            <Route path="/dashboard/superadmin/yape-plin" element={<AdminPagosManuales role="superadmin" />} />
            <Route path="/dashboard/superadmin/roles" element={<SuperRoles />} />
            <Route path="/dashboard/superadmin/auditoria" element={<SuperAudit />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </MaintenanceGate>
      </BrowserRouter>
      </FavoritesProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
