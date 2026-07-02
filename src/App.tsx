import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SupabaseAuthBridge } from "@/components/SupabaseAuthBridge";
import { FavoritesProvider } from "@/hooks/useFavorites";
import { RequireRole } from "@/components/RequireRole";

// Páginas críticas (primer render): se cargan de inmediato.
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import ListingDetail from "./pages/ListingDetail.tsx";

// Resto (panel, admin, gráficas) → carga diferida para aligerar el arranque.
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing.tsx"));
const AdvertiserInvoices = lazy(() => import("./pages/advertiser/AdvertiserInvoices.tsx"));
const AdvertiserDashboard = lazy(() => import("./pages/AdvertiserDashboard.tsx"));
const SeekerDashboard = lazy(() => import("./pages/SeekerDashboard.tsx"));
const AdvertiserPublish = lazy(() => import("./pages/advertiser/AdvertiserPublish.tsx"));
const AdvertiserListings = lazy(() => import("./pages/advertiser/AdvertiserListings.tsx"));
const AdvertiserApplications = lazy(() => import("./pages/advertiser/AdvertiserApplications.tsx"));
const AdvertiserStats = lazy(() => import("./pages/advertiser/AdvertiserStats.tsx"));
const SeekerSearch = lazy(() => import("./pages/seeker/SeekerSearch.tsx"));
const SeekerFavorites = lazy(() => import("./pages/seeker/SeekerFavorites.tsx"));
const SeekerSearches = lazy(() => import("./pages/seeker/SeekerSearches.tsx"));
const MessagesPage = lazy(() => import("./pages/shared/MessagesPage.tsx"));
const SettingsPage = lazy(() => import("./pages/shared/SettingsPage.tsx"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard.tsx"));
const AdminListings = lazy(() => import("./pages/admin/AdminListings.tsx"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers.tsx"));
const AdminCommunications = lazy(() => import("./pages/admin/AdminCommunications.tsx"));
const AdminCommercial = lazy(() => import("./pages/admin/AdminCommercial.tsx"));
const AdminReports = lazy(() => import("./pages/admin/AdminReports.tsx"));
const SuperRoles = lazy(() => import("./pages/superadmin/SuperRoles.tsx"));
const SuperAudit = lazy(() => import("./pages/superadmin/SuperAudit.tsx"));
const SuperConversations = lazy(() => import("./pages/superadmin/SuperConversations.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SupabaseAuthBridge />
      <FavoritesProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="w-9 h-9 rounded-full border-[3px] border-muted border-t-secondary animate-spin" /></div>}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthPage />} />
          {/* Login de staff (admin/superadmin): mismo formulario pero CON hCaptcha. */}
          <Route path="/auth/staff" element={<AuthPage requireCaptcha />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/buscar" element={<SearchPage />} />
          <Route path="/aviso/:id" element={<ListingDetail />} />
          <Route path="/planes" element={<Navigate to="/dashboard/anunciante/publicar" replace />} />
          <Route path="/mapa" element={<Navigate to="/buscar?view=map" replace />} />


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
          <Route path="/dashboard/buscador/buscar" element={<SeekerSearch />} />
          <Route path="/dashboard/buscador/favoritos" element={<SeekerFavorites />} />
          <Route path="/dashboard/buscador/busquedas" element={<SeekerSearches />} />
          <Route path="/dashboard/buscador/mensajes" element={<MessagesPage role="buscador" />} />
          <Route path="/dashboard/buscador/alertas" element={<Navigate to="/dashboard/buscador" replace />} />
          <Route path="/dashboard/buscador/configuracion" element={<SettingsPage role="buscador" />} />

          {/* Admin — requiere rol admin o superior (login real) */}
          <Route path="/dashboard/admin" element={<RequireRole min="admin"><AdminDashboard role="admin" /></RequireRole>} />
          <Route path="/dashboard/admin/avisos" element={<RequireRole min="admin"><AdminListings role="admin" /></RequireRole>} />
          <Route path="/dashboard/admin/usuarios" element={<RequireRole min="admin"><AdminUsers role="admin" /></RequireRole>} />
          <Route path="/dashboard/admin/comunicaciones" element={<RequireRole min="admin"><AdminCommunications role="admin" /></RequireRole>} />
          <Route path="/dashboard/admin/conversaciones" element={<RequireRole min="admin"><SuperConversations role="admin" /></RequireRole>} />
          <Route path="/dashboard/admin/comercial" element={<RequireRole min="admin"><AdminCommercial role="admin" /></RequireRole>} />
          <Route path="/dashboard/admin/reportes" element={<RequireRole min="admin"><AdminReports role="admin" /></RequireRole>} />
          <Route path="/dashboard/admin/tarifas" element={<RequireRole min="admin"><AdminPricing role="admin" /></RequireRole>} />

          {/* Super Admin — solo rol superadmin (login real) */}
          <Route path="/dashboard/superadmin" element={<RequireRole min="superadmin"><AdminDashboard role="superadmin" /></RequireRole>} />
          <Route path="/dashboard/superadmin/avisos" element={<RequireRole min="superadmin"><AdminListings role="superadmin" /></RequireRole>} />
          <Route path="/dashboard/superadmin/usuarios" element={<RequireRole min="superadmin"><AdminUsers role="superadmin" /></RequireRole>} />
          <Route path="/dashboard/superadmin/comunicaciones" element={<RequireRole min="superadmin"><AdminCommunications role="superadmin" /></RequireRole>} />
          <Route path="/dashboard/superadmin/conversaciones" element={<RequireRole min="superadmin"><SuperConversations role="superadmin" /></RequireRole>} />
          <Route path="/dashboard/superadmin/comercial" element={<RequireRole min="superadmin"><AdminCommercial role="superadmin" /></RequireRole>} />
          <Route path="/dashboard/superadmin/reportes" element={<RequireRole min="superadmin"><AdminReports role="superadmin" /></RequireRole>} />
          <Route path="/dashboard/superadmin/tarifas" element={<RequireRole min="superadmin"><AdminPricing role="superadmin" /></RequireRole>} />
          <Route path="/dashboard/superadmin/roles" element={<RequireRole min="superadmin"><SuperRoles /></RequireRole>} />
          <Route path="/dashboard/superadmin/auditoria" element={<RequireRole min="superadmin"><SuperAudit /></RequireRole>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </FavoritesProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
