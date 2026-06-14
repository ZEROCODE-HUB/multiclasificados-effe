import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListingCard } from "@/components/ListingCard";
import { Navbar } from "@/components/Navbar";
import { featuredListings, categories } from "@/data/mockData";
import {
  Search,
  LayoutGrid,
  List as ListIcon,
  Map as MapIcon,
  SlidersHorizontal,
  MapPin,
  Heart,
  Star,
  X,
} from "lucide-react";

type ViewMode = "list" | "map";
type Layout = "grid" | "list";

const PIN_POSITIONS = [
  { x: "22%", y: "28%" },
  { x: "48%", y: "42%" },
  { x: "65%", y: "30%" },
  { x: "35%", y: "60%" },
  { x: "72%", y: "62%" },
  { x: "55%", y: "75%" },
  { x: "18%", y: "70%" },
  { x: "82%", y: "45%" },
];

const formatPrice = (price: number, currency: string) =>
  currency === "USD" ? `US$ ${(price / 1000).toFixed(0)}K` : `S/ ${price.toLocaleString()}`;

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initialView = (params.get("view") as ViewMode) || "list";
  const [view, setView] = useState<ViewMode>(initialView);
  const [layout, setLayout] = useState<Layout>("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [active, setActive] = useState<string | null>(featuredListings[0]?.id ?? null);

  const listings = featuredListings;

  const switchView = (v: ViewMode) => {
    setView(v);
    const next = new URLSearchParams(params);
    if (v === "map") next.set("view", "map");
    else next.delete("view");
    setParams(next, { replace: true });
  };

  const FilterBar = useMemo(
    () => (
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 md:px-6 py-3 flex items-center gap-3 overflow-x-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters((s) => !s)}
            className="gap-2 rounded-full shrink-0"
          >
            <SlidersHorizontal size={14} /> Filtros
          </Button>
          {categories.slice(0, 6).map((c) => (
            <button
              key={c.id}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-full hover:border-secondary hover:text-secondary transition-colors shrink-0"
            >
              <c.icon size={12} /> {c.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 border border-border rounded-full p-0.5 shrink-0">
            <button
              onClick={() => switchView("list")}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full transition-colors ${
                view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListIcon size={12} className="inline mr-1" /> Lista
            </button>
            <button
              onClick={() => switchView("map")}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full transition-colors ${
                view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapIcon size={12} className="inline mr-1" /> Mapa
            </button>
          </div>
        </div>
      </div>
    ),
    [view, params]
  );

  const FiltersPanel = (
    <div className="bg-card border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground">Filtros</h3>
        <button onClick={() => setShowFilters(false)} className="lg:hidden text-muted-foreground">
          <X size={16} />
        </button>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Categoría</label>
        <Select>
          <SelectTrigger className="mt-1.5 rounded-none"><SelectValue placeholder="Todas" /></SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Precio min</label>
          <Input type="number" placeholder="0" className="mt-1.5 rounded-none" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Precio max</label>
          <Input type="number" placeholder="Sin límite" className="mt-1.5 rounded-none" />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Ubicación</label>
        <Input placeholder="Ej: Lima, Miraflores" className="mt-1.5 rounded-none" />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Ordenar por</label>
        <Select>
          <SelectTrigger className="mt-1.5 rounded-none"><SelectValue placeholder="Más recientes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Más recientes</SelectItem>
            <SelectItem value="price-asc">Precio: menor a mayor</SelectItem>
            <SelectItem value="price-desc">Precio: mayor a menor</SelectItem>
            <SelectItem value="views">Más vistos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full rounded-none" size="sm">Aplicar filtros</Button>
    </div>
  );

  return (
    <div className={`${view === "map" ? "h-screen" : "min-h-screen"} flex flex-col bg-background`}>
      <Navbar />
      {FilterBar}

      {view === "list" ? (
        <div className="container mx-auto px-4 md:px-6 py-8 flex-1">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-secondary">Resultados</p>
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground mt-1">
                {listings.length} avisos disponibles
              </h1>
            </div>
            <div className="hidden md:flex gap-1 border border-border p-0.5">
              <Button
                variant={layout === "grid" ? "default" : "ghost"}
                size="icon"
                onClick={() => setLayout("grid")}
                className="rounded-none h-8 w-8"
              >
                <LayoutGrid size={14} />
              </Button>
              <Button
                variant={layout === "list" ? "default" : "ghost"}
                size="icon"
                onClick={() => setLayout("list")}
                className="rounded-none h-8 w-8"
              >
                <ListIcon size={14} />
              </Button>
            </div>
          </div>

          <div className="flex gap-6">
            <aside className={`${showFilters ? "block" : "hidden"} lg:block w-full lg:w-72 flex-shrink-0`}>
              {FiltersPanel}
            </aside>

            <div className="flex-1 min-w-0">
              <div
                className={
                  layout === "grid"
                    ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5"
                    : "space-y-4"
                }
              >
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} layout={layout} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[480px_1fr] min-h-0">
          {/* List */}
          <div className="overflow-y-auto border-r border-border bg-background">
            <div className="px-5 py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-secondary">Resultados</p>
              <h1 className="text-lg font-bold text-foreground mt-1">
                {listings.length} avisos en el mapa
              </h1>
            </div>
            <div className="divide-y divide-border">
              {listings.map((l) => (
                <Link
                  key={l.id}
                  to={`/aviso/${l.id}`}
                  onMouseEnter={() => setActive(l.id)}
                  className={`flex gap-4 p-4 transition-colors ${
                    active === l.id ? "bg-muted/60" : "hover:bg-muted/40"
                  }`}
                >
                  <div
                    className="w-32 shrink-0 bg-muted overflow-hidden"
                    style={{ aspectRatio: "4 / 3" }}
                  >
                    <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-secondary">
                        {l.category}
                      </span>
                      <button
                        onClick={(e) => e.preventDefault()}
                        className="text-muted-foreground hover:text-secondary"
                      >
                        <Heart size={14} />
                      </button>
                    </div>
                    <h3 className="font-semibold text-sm text-foreground line-clamp-2 mt-1">{l.title}</h3>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1.5">
                      <Star size={11} className="text-secondary fill-secondary" />
                      <span className="font-semibold text-foreground">4.8</span>
                      <span>·</span>
                      <span className="truncate">
                        <MapPin size={10} className="inline" /> {l.location}
                      </span>
                    </div>
                    <p className="text-base font-extrabold text-primary mt-2">
                      {formatPrice(l.price, l.currency)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Map */}
          <div className="relative bg-muted overflow-hidden hidden lg:block">
            <img
              src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1600&h=1200&fit=crop"
              alt="Mapa interactivo de avisos"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-primary/10" />
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(to right, hsl(var(--primary)/.3) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary)/.3) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />

            {listings.map((l, i) => {
              const pos = PIN_POSITIONS[i % PIN_POSITIONS.length];
              const isActive = active === l.id;
              return (
                <Link
                  key={l.id}
                  to={`/aviso/${l.id}`}
                  onMouseEnter={() => setActive(l.id)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: pos.x, top: pos.y, zIndex: isActive ? 30 : 10 }}
                >
                  <div
                    className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground scale-110 ring-4 ring-primary/20"
                        : "bg-secondary text-secondary-foreground ring-4 ring-secondary/20 hover:scale-110"
                    }`}
                  >
                    {formatPrice(l.price, l.currency)}
                  </div>
                  {isActive && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-64 bg-card border border-border shadow-2xl overflow-hidden animate-fade-in">
                      <div className="aspect-[4/3] bg-muted">
                        <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-3">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-secondary">
                          {l.category}
                        </span>
                        <h4 className="text-sm font-semibold text-foreground line-clamp-1 mt-1">{l.title}</h4>
                        <p className="text-base font-extrabold text-primary mt-1">
                          {formatPrice(l.price, l.currency)}
                        </p>
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}

            <div className="absolute bottom-3 right-3 px-2 py-1 bg-card/90 backdrop-blur text-[10px] text-muted-foreground rounded">
              Vista de mapa demo · Próximamente con datos reales
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
