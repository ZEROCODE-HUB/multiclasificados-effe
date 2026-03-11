import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, MapPin, SlidersHorizontal } from "lucide-react";
import { featuredListings, categories } from "@/data/mockData";

const SeekerSearch = () => (
  <DashboardLayout role="buscador">
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Buscar avisos</h1>
        <p className="text-muted-foreground">Encuentra exactamente lo que necesitas.</p>
      </div>

      {/* Search filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input placeholder="¿Qué estás buscando?" className="pl-10" />
            </div>
            <Select>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Ubicación" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lima">Lima</SelectItem>
                <SelectItem value="arequipa">Arequipa</SelectItem>
                <SelectItem value="cusco">Cusco</SelectItem>
                <SelectItem value="trujillo">Trujillo</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon"><SlidersHorizontal size={18} /></Button>
            <Button variant="hero">Buscar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Se encontraron <span className="font-medium text-foreground">6</span> resultados</p>
        <Select>
          <SelectTrigger className="w-44"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Más recientes</SelectItem>
            <SelectItem value="price-asc">Precio: menor a mayor</SelectItem>
            <SelectItem value="price-desc">Precio: mayor a menor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        {featuredListings.map((listing) => (
          <Card key={listing.id} className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-0">
              <div className="flex flex-col md:flex-row">
                <img src={listing.imageUrl} alt={listing.title} className="w-full md:w-48 h-40 md:h-auto object-cover rounded-t-lg md:rounded-l-lg md:rounded-tr-none" />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-foreground">{listing.title}</h3>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin size={12} /> {listing.location}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{listing.category}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{listing.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-lg font-bold text-secondary">{listing.currency} {listing.price.toLocaleString()}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">Guardar</Button>
                      <Button variant="hero" size="sm">Contactar</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  </DashboardLayout>
);

export default SeekerSearch;
