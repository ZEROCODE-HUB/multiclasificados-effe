import { useEffect, useState } from "react";
import { imgUrl } from "@/lib/imageUrl";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, Search, MessageSquare, Bell, Clock, MapPin, Star, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useFavorites } from "@/hooks/useFavorites";
import { fetchListingsByIds } from "@/lib/listings";
import { type Listing } from "@/data/mockData";
import { fetchSavedSearches, criteriaLabel, criteriaToSearchUrl, type SavedSearch } from "@/lib/savedSearches";

const SeekerDashboard = () => {
  const session = useSession();
  const unread = useUnreadMessages();
  const { ids } = useFavorites();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [favItems, setFavItems] = useState<Listing[]>([]);

  // Datos reales del usuario (búsquedas guardadas + favoritos).
  useEffect(() => {
    fetchSavedSearches().then(setSavedSearches);
  }, []);
  useEffect(() => {
    fetchListingsByIds([...ids]).then(setFavItems);
  }, [ids]);

  const firstName = (session?.name || "").split(" ")[0] || "buscador";
  const alerts = savedSearches.filter((s) => s.alert_enabled);

  // Contadores reales.
  const stats = [
    { label: "Favoritos", value: ids.size, icon: Heart, text: "text-rose-600", bg: "bg-rose-500/10" },
    { label: "Búsquedas guardadas", value: savedSearches.length, icon: Search, text: "text-primary", bg: "bg-primary/10" },
    { label: "Mensajes", value: unread, icon: MessageSquare, text: "text-secondary", bg: "bg-secondary/10" },
    { label: "Alertas activas", value: alerts.length, icon: Bell, text: "text-warning", bg: "bg-warning/10" },
  ];

  return (
    <DashboardLayout role="buscador">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        {/* Greeting banner */}
        <div className="relative overflow-hidden rounded-2xl gradient-hero text-primary-foreground p-5 md:p-7">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-secondary/30 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-widest text-secondary font-bold mb-1">Bienvenido</p>
            <h1 className="text-xl md:text-3xl font-extrabold">¡Hola, {firstName}!</h1>
            <p className="text-primary-foreground/70 text-sm md:text-base mt-1">
              Encuentra lo que estás buscando hoy.
            </p>
          </div>
        </div>

        {/* Stats - colorful */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {stats.map((stat) => (
            <Card
              key={stat.label}
              className="overflow-hidden border-l-4 hover:shadow-md transition-all"
              style={{ borderLeftColor: `hsl(var(--secondary))` }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.bg} ${stat.text}`}>
                    <stat.icon size={20} />
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-extrabold text-foreground leading-none">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Saved searches */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Search size={18} className="text-primary" /> Búsquedas guardadas
            </CardTitle>
            <Link to="/dashboard/buscador/busquedas">
              <Button variant="ghost" size="sm" className="text-secondary gap-1 text-xs">
                Ver todas <ArrowRight size={14} />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {savedSearches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No tienes búsquedas guardadas.{" "}
                <Link to="/buscar" className="text-secondary font-semibold hover:underline">Explora y guarda una</Link>.
              </p>
            ) : (
              savedSearches.slice(0, 3).map((s) => (
                <Link
                  key={s.id}
                  to={criteriaToSearchUrl(s.criteria)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                >
                  <Clock size={16} className="text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.name || criteriaLabel(s.criteria)}</p>
                    <p className="text-xs text-muted-foreground">{s.criteria.category || "Todas las categorías"}</p>
                  </div>
                  {s.alert_enabled && <Badge variant="outline" className="flex-shrink-0 text-[10px]">Alerta</Badge>}
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Favorites */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart size={18} className="text-destructive" /> Mis favoritos
            </CardTitle>
            <Link to="/dashboard/buscador/favoritos">
              <Button variant="ghost" size="sm" className="text-secondary gap-1 text-xs">
                Ver todos <ArrowRight size={14} />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {favItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No tienes favoritos.{" "}
                <Link to="/buscar" className="text-secondary font-semibold hover:underline">Explora avisos</Link> y guárdalos con el corazón.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {favItems.slice(0, 4).map((listing) => (
                  <Link
                    key={listing.id}
                    to={`/aviso/${listing.id}`}
                    className="flex gap-3 p-3 rounded-lg border hover:shadow-md transition-shadow"
                  >
                    <img src={imgUrl(listing.imageUrl, 160)} alt={listing.title} loading="lazy" decoding="async" className="w-20 h-16 object-cover rounded" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{listing.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <MapPin size={12} /> {listing.location}
                      </p>
                      <p className="text-sm font-bold text-primary mt-1">
                        <span className="text-xs text-secondary mr-1">{listing.currency}</span>
                        {listing.price.toLocaleString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell size={18} className="text-warning" /> Alertas configuradas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No tienes alertas activas. Actívalas en tus{" "}
                <Link to="/dashboard/buscador/busquedas" className="text-secondary font-semibold hover:underline">búsquedas guardadas</Link>.
              </p>
            ) : (
              alerts.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                  <Star size={16} className="text-warning flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{s.name || criteriaLabel(s.criteria)}</p>
                    <p className="text-xs text-muted-foreground">Te avisamos cuando haya nuevos avisos</p>
                  </div>
                  <Badge className="bg-secondary text-secondary-foreground text-[10px] flex-shrink-0">Activa</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SeekerDashboard;
