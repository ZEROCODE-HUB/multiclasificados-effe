import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { featuredListings } from "@/data/mockData";
import { Heart, Search, MessageSquare, Bell, Clock, MapPin, Star, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SeekerDashboard = () => {
  return (
    <DashboardLayout role="buscador">
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">¡Hola, Ana!</h1>
            <p className="text-muted-foreground">Encuentra lo que estás buscando.</p>
          </div>
        </div>

        {/* Quick search */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input placeholder="Buscar avisos..." className="pl-10" />
              </div>
              <Button variant="outline" size="icon">
                <Filter size={18} />
              </Button>
              <Button variant="hero">Buscar</Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Favoritos", value: 8, icon: Heart, color: "text-destructive" },
            { label: "Búsquedas guardadas", value: 3, icon: Search, color: "text-primary" },
            { label: "Mensajes enviados", value: 12, icon: MessageSquare, color: "text-secondary" },
            { label: "Alertas activas", value: 5, icon: Bell, color: "text-warning" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                  <stat.icon size={20} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Saved searches */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search size={18} className="text-primary" />
              Búsquedas guardadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { query: "Departamento 2 dormitorios Miraflores", category: "Inmuebles", results: 24 },
              { query: "Toyota Corolla 2023-2025", category: "Vehículos", results: 8 },
              { query: "Desarrollador React remoto", category: "Empleos", results: 15 },
            ].map((search, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <Clock size={16} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{search.query}</p>
                  <p className="text-xs text-muted-foreground">{search.category}</p>
                </div>
                <Badge variant="outline">{search.results} resultados</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Favorites */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Heart size={18} className="text-destructive" />
              Mis favoritos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {featuredListings.slice(0, 4).map((listing) => (
                <div key={listing.id} className="flex gap-3 p-3 rounded-lg border hover:shadow-md transition-shadow">
                  <img src={listing.imageUrl} alt={listing.title} className="w-20 h-16 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{listing.title}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin size={12} /> {listing.location}
                    </p>
                    <p className="text-sm font-bold text-secondary mt-1">
                      {listing.currency} {listing.price.toLocaleString()}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive flex-shrink-0">
                    <Heart size={16} fill="currentColor" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent contacts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare size={18} className="text-secondary" />
              Conversaciones recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { name: "Inmobiliaria Pacífico", listing: "Departamento 3 dormitorios", lastMessage: "Sí, aún está disponible. ¿Cuándo puede visitarnos?", time: "Hace 1h" },
              { name: "Carlos Mendoza", listing: "Toyota Corolla 2024", lastMessage: "Le puedo hacer un descuento si cierra esta semana.", time: "Hace 3h" },
              { name: "TechPeru SAC", listing: "Desarrollador Full Stack", lastMessage: "Gracias por postular. Le contactaremos pronto.", time: "Ayer" },
            ].map((conv, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">
                  {conv.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{conv.name}</p>
                    <span className="text-xs text-muted-foreground">{conv.time}</span>
                  </div>
                  <p className="text-xs text-secondary">{conv.listing}</p>
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell size={18} className="text-warning" />
              Alertas configuradas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { criteria: "Departamentos en Miraflores < USD 1,000", frequency: "Diaria", new: 3 },
              { criteria: "Autos Toyota < USD 20,000", frequency: "Semanal", new: 1 },
              { criteria: "Empleos React en Lima", frequency: "Inmediata", new: 5 },
            ].map((alert, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                <Star size={16} className="text-warning flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{alert.criteria}</p>
                  <p className="text-xs text-muted-foreground">Frecuencia: {alert.frequency}</p>
                </div>
                {alert.new > 0 && (
                  <Badge className="bg-secondary text-secondary-foreground">{alert.new} nuevos</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SeekerDashboard;
