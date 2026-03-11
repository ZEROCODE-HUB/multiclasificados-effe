import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/AuthPage.tsx";
import SearchPage from "./pages/SearchPage.tsx";
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

          {/* Advertiser routes */}
          <Route path="/dashboard/anunciante" element={<AdvertiserDashboard />} />
          <Route path="/dashboard/anunciante/publicar" element={<AdvertiserPublish />} />
          <Route path="/dashboard/anunciante/avisos" element={<AdvertiserListings />} />
          <Route path="/dashboard/anunciante/mensajes" element={<MessagesPage role="anunciante" />} />
          <Route path="/dashboard/anunciante/postulaciones" element={<AdvertiserApplications />} />
          <Route path="/dashboard/anunciante/estadisticas" element={<AdvertiserStats />} />
          <Route path="/dashboard/anunciante/configuracion" element={<SettingsPage role="anunciante" />} />

          {/* Seeker routes */}
          <Route path="/dashboard/buscador" element={<SeekerDashboard />} />
          <Route path="/dashboard/buscador/buscar" element={<SeekerSearch />} />
          <Route path="/dashboard/buscador/favoritos" element={<SeekerFavorites />} />
          <Route path="/dashboard/buscador/busquedas" element={<SeekerSearches />} />
          <Route path="/dashboard/buscador/mensajes" element={<MessagesPage role="buscador" />} />
          <Route path="/dashboard/buscador/alertas" element={<SeekerAlerts />} />
          <Route path="/dashboard/buscador/configuracion" element={<SettingsPage role="buscador" />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
