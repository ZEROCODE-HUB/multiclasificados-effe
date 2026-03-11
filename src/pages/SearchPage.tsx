import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingCard } from "@/components/ListingCard";
import { Navbar } from "@/components/Navbar";
import { featuredListings, categories } from "@/data/mockData";
import { Search, LayoutGrid, List, SlidersHorizontal } from "lucide-react";

const SearchPage = () => {
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-20 pb-12">
        <h1 className="text-2xl font-bold text-foreground mb-6">Explorar avisos</h1>

        {/* Search bar */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input placeholder="Buscar avisos..." className="pl-10" />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="md:hidden"
          >
            <SlidersHorizontal size={16} className="mr-2" /> Filtros
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Filters sidebar */}
          <aside className={`${showFilters ? "block" : "hidden"} md:block w-full md:w-64 flex-shrink-0 space-y-4`}>
            <div className="bg-card rounded-lg border p-4 space-y-4">
              <h3 className="font-semibold text-foreground">Filtros</h3>
              <div>
                <label className="text-sm text-muted-foreground">Categoría</label>
                <Select>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Precio mínimo</label>
                <Input type="number" placeholder="0" className="mt-1" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Precio máximo</label>
                <Input type="number" placeholder="Sin límite" className="mt-1" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Ubicación</label>
                <Input placeholder="Ej: Lima, Miraflores" className="mt-1" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Ordenar por</label>
                <Select>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Más recientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Más recientes</SelectItem>
                    <SelectItem value="price-asc">Precio: menor a mayor</SelectItem>
                    <SelectItem value="price-desc">Precio: mayor a menor</SelectItem>
                    <SelectItem value="views">Más vistos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" size="sm">Aplicar filtros</Button>
            </div>
          </aside>

          {/* Results */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">{featuredListings.length} resultados</p>
              <div className="flex gap-1">
                <Button
                  variant={layout === "grid" ? "default" : "ghost"}
                  size="icon"
                  onClick={() => setLayout("grid")}
                >
                  <LayoutGrid size={16} />
                </Button>
                <Button
                  variant={layout === "list" ? "default" : "ghost"}
                  size="icon"
                  onClick={() => setLayout("list")}
                >
                  <List size={16} />
                </Button>
              </div>
            </div>
            <div className={layout === "grid" ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" : "space-y-4"}>
              {featuredListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} layout={layout} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
