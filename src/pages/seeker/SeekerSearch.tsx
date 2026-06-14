import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, SlidersHorizontal, X } from "lucide-react";
import { featuredListings, categories } from "@/data/mockData";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";

const FiltersContent = ({ onApply }: { onApply: () => void }) => {
  const [price, setPrice] = useState([0, 5000]);
  return (
    <div className="space-y-6 mt-4">
      <div>
        <Label className="text-sm font-semibold">Categoría</Label>
        <Select>
          <SelectTrigger className="mt-2"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
          <SelectContent>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-sm font-semibold">Ubicación</Label>
        <Select>
          <SelectTrigger className="mt-2"><SelectValue placeholder="Todas las ubicaciones" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lima">Lima</SelectItem>
            <SelectItem value="arequipa">Arequipa</SelectItem>
            <SelectItem value="cusco">Cusco</SelectItem>
            <SelectItem value="trujillo">Trujillo</SelectItem>
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
          {["Nuevo", "Usado", "Reacondicionado"].map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <Checkbox /> {c}
            </label>
          ))}
        </div>
      </div>
      <Button variant="hero" className="w-full" onClick={onApply}>Aplicar filtros</Button>
    </div>
  );
};

const SeekerSearch = () => {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggleSave = (id: string, title: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast({ title: "Eliminado", description: `"${title}" quitado de guardados.` });
      } else {
        next.add(id);
        toast({ title: "Guardado", description: `"${title}" se agregó a tus guardados.` });
      }
      return next;
    });
  };

  const handleContact = (title: string) => {
    toast({ title: "Contacto enviado", description: `Solicitud sobre "${title}" enviada.` });
  };

  return (
    <DashboardLayout role="buscador">
      <div className="space-y-5 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buscar avisos</h1>
          <p className="text-sm text-muted-foreground">Encuentra exactamente lo que necesitas.</p>
        </div>

        {/* Search bar */}
        <Card className="rounded-lg">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <Input placeholder="¿Qué estás buscando?" className="pl-10 h-11" />
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
                      <SheetTitle>Filtros de búsqueda</SheetTitle>
                    </SheetHeader>
                    <FiltersContent
                      onApply={() => {
                        setFiltersOpen(false);
                        toast({ title: "Filtros aplicados" });
                      }}
                    />
                  </SheetContent>
                </Sheet>
                <Button variant="hero" size="lg" className="flex-1 sm:flex-none px-6">Buscar</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Se encontraron <span className="font-semibold text-foreground">{featuredListings.length}</span> resultados
          </p>
          <Select>
            <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Ordenar por" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Más recientes</SelectItem>
              <SelectItem value="price-asc">Precio: menor a mayor</SelectItem>
              <SelectItem value="price-desc">Precio: mayor a menor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8">
          {featuredListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SeekerSearch;
