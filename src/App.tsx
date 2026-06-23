import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";
import { SupabaseAuthBridge } from "@/components/SupabaseAuthBridge";
import { FavoritesProvider } from "@/hooks/useFavorites";
import SearchPage from "./pages/SearchPage.tsx";
import ListingDetail from "./pages/ListingDetail.tsx";
import AdminPricing from "./pages/admin/AdminPricing.tsx";
import AdvertiserInvoices from "./pages/advertiser/AdvertiserInvoices.tsx";
import { Navigate } from "react-router-dom";
import AdvertiserDashboard from "./pages/AdvertiserDashboard.tsx";
import SeekerDashboard from "./pages/SeekerDashboard.tsx";
import AdvertiserPublish from "./pages/advertiser/AdvertiserPublish.tsx";
import AdvertiserListings from "./pages/advertiser/AdvertiserListings.tsx";
import AdvertiserApplications from "./pages/advertiser/AdvertiserApplications.tsx";
import AdvertiserStats from "./pages/advertiser/AdvertiserStats.tsx";
import SeekerSearch from "./pages/seeker/SeekerSearch.tsx";
import SeekerFavorites from "./pages/seeker/SeekerFavorites.tsx";
import SeekerSearches from "./pages/seeker/SeekerSearches.tsx";
import MessagesPage from "./pages/shared/MessagesPage.tsx";
import SettingsPage from "./pages/shared/SettingsPage.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminListings from "./pages/admin/AdminListings.tsx";
import AdminUsers from "./pages/admin/AdminUsers.tsx";
import AdminCommunications from "./pages/admin/AdminCommunications.tsx";
import AdminCommercial from "./pages/admin/AdminCommercial.tsx";
import AdminReports from "./pages/admin/AdminReports.tsx";
import SuperRoles from "./pages/superadmin/SuperRoles.tsx";
import SuperAudit from "./pages/superadmin/SuperAudit.tsx";
import SuperConversations from "./pages/superadmin/SuperConversations.tsx";
import { RequireRole } from "@/components/RequireRole";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SupabaseAuthBridge />
      <FavoritesProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthPage />} />
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
      </BrowserRouter>
      </FavoritesProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
