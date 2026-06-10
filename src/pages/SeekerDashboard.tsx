import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { featuredListings } from "@/data/mockData";
import { Heart, Search, MessageSquare, Bell, Clock, MapPin, Star, SlidersHorizontal, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

const stats = [
  { label: "Favoritos", value: 8, icon: Heart, gradient: "from-rose-500 to-pink-600", text: "text-rose-600", bg: "bg-rose-500/10" },
  { label: "Búsquedas guardadas", value: 3, icon: Search, gradient: "from-blue-500 to-primary", text: "text-primary", bg: "bg-primary/10" },
  { label: "Mensajes enviados", value: 12, icon: MessageSquare, gradient: "from-orange-500 to-secondary", text: "text-secondary", bg: "bg-secondary/10" },
  { label: "Alertas activas", value: 5, icon: Bell, gradient: "from-amber-500 to-warning", text: "text-warning", bg: "bg-warning/10" },
];

const SeekerDashboard = () => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [price, setPrice] = useState([0, 3000]);

  return (
    <DashboardLayout role="buscador">
      <div className="space-y-5 md:space-y-6 animate-fade-in">
        {/* Greeting banner */}
        <div className="relative overflow-hidden rounded-2xl gradient-hero text-primary-foreground p-5 md:p-7">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-secondary/30 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-widest text-secondary font-bold mb-1">Bienvenida</p>
            <h1 className="text-xl md:text-3xl font-extrabold">¡Hola, Ana!</h1>
            <p className="text-primary-foreground/70 text-sm md:text-base mt-1">
              Encuentra lo que estás buscando hoy.
            </p>
          </div>
        </div>

        {/* Quick search */}
        <Card className="rounded-lg">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input placeholder="Buscar avisos..." className="pl-10 h-11" />
              </div>
              <div className="flex gap-2">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="lg" className="gap-2 flex-1 sm:flex-none">
                      <SlidersHorizontal size={16} /> Filtros
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Filtros</SheetTitle>
                    </SheetHeader>
                    <div className="space-y-6 mt-4">
                      <div>
                        <Label className="text-sm font-semibold">Categoría</Label>
                        <Select>
                          <SelectTrigger className="mt-2"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inmuebles">Inmuebles</SelectItem>
                            <SelectItem value="vehiculos">Vehículos</SelectItem>
                            <SelectItem value="empleos">Empleos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-sm font-semibold">Ubicación</Label>
                        <Select>
                          <SelectTrigger className="mt-2"><SelectValue placeholder="Todas" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lima">Lima</SelectItem>
                            <SelectItem value="arequipa">Arequipa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="flex justify-between mb-2">
                          <Label className="text-sm font-semibold">Rango de precio</Label>
                          <span className="text-xs text-muted-foreground">${price[0]} – ${price[1]}</span>
                        </div>
                        <Slider value={price} onValueChange={setPrice} min={0} max={5000} step={50} />
                      </div>
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Condición</Label>
                        <div className="space-y-2">
                          {["Nuevo", "Usado"].map((c) => (
                            <label key={c} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                              <Checkbox /> {c}
                            </label>
                          ))}
                        </div>
                      </div>
                      <Button
                        variant="hero"
                        className="w-full"
                        onClick={() => {
                          setFiltersOpen(false);
                          toast({ title: "Filtros aplicados" });
                        }}
                      >
                        Aplicar filtros
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
                <Button variant="hero" size="lg" className="flex-1 sm:flex-none px-6">Buscar</Button>
              </div>
            </div>
          </CardContent>
        </Card>

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
                <Badge variant="outline" className="flex-shrink-0 text-[10px]">{search.results}</Badge>
              </div>
            ))}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {featuredListings.slice(0, 4).map((listing) => (
                <div key={listing.id} className="flex gap-3 p-3 rounded-lg border hover:shadow-md transition-shadow">
                  <img src={listing.imageUrl} alt={listing.title} className="w-20 h-16 object-cover rounded" />
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
                </div>
              ))}
            </div>
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
            {[
              { criteria: "Departamentos en Miraflores < USD 1,000", frequency: "Diaria", new: 3 },
              { criteria: "Autos Toyota < USD 20,000", frequency: "Semanal", new: 1 },
              { criteria: "Empleos React en Lima", frequency: "Inmediata", new: 5 },
            ].map((alert, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                <Star size={16} className="text-warning flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{alert.criteria}</p>
                  <p className="text-xs text-muted-foreground">Frecuencia: {alert.frequency}</p>
                </div>
                {alert.new > 0 && (
                  <Badge className="bg-secondary text-secondary-foreground text-[10px] flex-shrink-0">{alert.new} nuevos</Badge>
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
