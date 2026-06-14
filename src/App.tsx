import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import ListingDetail from "./pages/ListingDetail.tsx";
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
import SeekerAlerts from "./pages/seeker/SeekerAlerts.tsx";
import MessagesPage from "./pages/shared/MessagesPage.tsx";
import SettingsPage from "./pages/shared/SettingsPage.tsx";
import AdminDashboard from "./pages/admin/AdminDashboard.tsx";
import AdminListings from "./pages/admin/AdminListings.tsx";
import AdminUsers from "./pages/admin/AdminUsers.tsx";
import AdminCommunications from "./pages/admin/AdminCommunications.tsx";
import AdminCommercial from "./pages/admin/AdminCommercial.tsx";
import AdminReports from "./pages/admin/AdminReports.tsx";
import SuperRoles from "./pages/superadmin/SuperRoles.tsx";
import SuperPlatform from "./pages/superadmin/SuperPlatform.tsx";
import SuperIntegrations from "./pages/superadmin/SuperIntegrations.tsx";
import SuperSecurity from "./pages/superadmin/SuperSecurity.tsx";
import SuperAudit from "./pages/superadmin/SuperAudit.tsx";
import SuperMonitoring from "./pages/superadmin/SuperMonitoring.tsx";
import SuperConversations from "./pages/superadmin/SuperConversations.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/buscar" element={<SearchPage />} />
          <Route path="/aviso/:id" element={<ListingDetail />} />
          <Route path="/mapa" element={<Navigate to="/buscar?view=map" replace />} />

          {/* Advertiser */}
          <Route path="/dashboard/anunciante" element={<AdvertiserDashboard />} />
          <Route path="/dashboard/anunciante/publicar" element={<AdvertiserPublish />} />
          <Route path="/dashboard/anunciante/avisos" element={<AdvertiserListings />} />
          <Route path="/dashboard/anunciante/mensajes" element={<MessagesPage role="anunciante" />} />
          <Route path="/dashboard/anunciante/postulaciones" element={<AdvertiserApplications />} />
          <Route path="/dashboard/anunciante/estadisticas" element={<AdvertiserStats />} />
          <Route path="/dashboard/anunciante/configuracion" element={<SettingsPage role="anunciante" />} />

          {/* Seeker */}
          <Route path="/dashboard/buscador" element={<SeekerDashboard />} />
          <Route path="/dashboard/buscador/buscar" element={<SeekerSearch />} />
          <Route path="/dashboard/buscador/favoritos" element={<SeekerFavorites />} />
          <Route path="/dashboard/buscador/busquedas" element={<SeekerSearches />} />
          <Route path="/dashboard/buscador/mensajes" element={<MessagesPage role="buscador" />} />
          <Route path="/dashboard/buscador/alertas" element={<SeekerAlerts />} />
          <Route path="/dashboard/buscador/configuracion" element={<SettingsPage role="buscador" />} />

          {/* Admin */}
          <Route path="/dashboard/admin" element={<AdminDashboard role="admin" />} />
          <Route path="/dashboard/admin/avisos" element={<AdminListings role="admin" />} />
          <Route path="/dashboard/admin/usuarios" element={<AdminUsers role="admin" />} />
          <Route path="/dashboard/admin/comunicaciones" element={<AdminCommunications role="admin" />} />
          <Route path="/dashboard/admin/comercial" element={<AdminCommercial role="admin" />} />
          <Route path="/dashboard/admin/reportes" element={<AdminReports role="admin" />} />

          {/* Super Admin */}
          <Route path="/dashboard/superadmin" element={<AdminDashboard role="superadmin" />} />
          <Route path="/dashboard/superadmin/avisos" element={<AdminListings role="superadmin" />} />
          <Route path="/dashboard/superadmin/usuarios" element={<AdminUsers role="superadmin" />} />
          <Route path="/dashboard/superadmin/comunicaciones" element={<AdminCommunications role="superadmin" />} />
          <Route path="/dashboard/superadmin/comercial" element={<AdminCommercial role="superadmin" />} />
          <Route path="/dashboard/superadmin/reportes" element={<AdminReports role="superadmin" />} />
          <Route path="/dashboard/superadmin/roles" element={<SuperRoles />} />
          <Route path="/dashboard/superadmin/plataforma" element={<SuperPlatform />} />
          <Route path="/dashboard/superadmin/integraciones" element={<SuperIntegrations />} />
          <Route path="/dashboard/superadmin/seguridad" element={<SuperSecurity />} />
          <Route path="/dashboard/superadmin/auditoria" element={<SuperAudit />} />
          <Route path="/dashboard/superadmin/monitoreo" element={<SuperMonitoring />} />
          <Route path="/dashboard/superadmin/conversaciones" element={<SuperConversations />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
