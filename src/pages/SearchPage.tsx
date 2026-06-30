import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ListingCard } from "@/components/ListingCard";
import { Navbar } from "@/components/Navbar";
import { categories, type Listing } from "@/data/mockData";
import { searchListings, fetchListingsByOwner, type SortKey } from "@/lib/listings";
import { useSession } from "@/hooks/useSession";
import { createSavedSearch } from "@/lib/savedSearches";
import { toast } from "@/hooks/use-toast";
import {
  Search,
  LayoutGrid,
  List as ListIcon,
  Map as MapIcon,
  SlidersHorizontal,
  MapPin,
  Heart,
  Star,
  Bookmark,
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
  const navigate = useNavigate();
  const session = useSession();
  const initialView = (params.get("view") as ViewMode) || "list";
  const [view, setView] = useState<ViewMode>(initialView);
  const [layout, setLayout] = useState<Layout>("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  // ---- Datos reales + filtros + búsqueda EN VIVO (REQ-02) ----
  const [listings, setListings] = useState<Listing[]>([]);
  const [q, setQ] = useState<string>(params.get("q") || "");
  const [category, setCategory] = useState<string>(params.get("cat") || "");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [sort, setSort] = useState<SortKey>((params.get("sort") as SortKey) || "recent");

  // Sincroniza texto/categoría/orden/precio desde la URL (navbar, hero, búsquedas guardadas).
  useEffect(() => {
    setQ(params.get("q") || "");
    setCategory(params.get("cat") || "");
    setSort((params.get("sort") as SortKey) || "recent");
    setPriceMin(params.get("min") || "");
    setPriceMax(params.get("max") || "");
  }, [params]);

  // Guarda la búsqueda actual (REQ-04).
  const saveCurrentSearch = async () => {
    if (!session?.supabase) {
      toast({ title: "Inicia sesión", description: "Crea una cuenta para guardar búsquedas y recibir alertas." });
      navigate("/auth?redirect=/buscar");
      return;
    }
    const catName = categories.find((c) => c.id === category)?.name;
    const defaultName = q || catName || "Mi búsqueda";
    try {
      await createSavedSearch(
        {
          q: q || undefined,
          category: category || undefined,
          priceMin: priceMin ? Number(priceMin) : undefined,
          priceMax: priceMax ? Number(priceMax) : undefined,
          sort,
        },
        defaultName
      );
      toast({ title: "Búsqueda guardada", description: "La verás en 'Mis búsquedas' y recibirás alertas de nuevos avisos." });
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e instanceof Error ? e.message : "Intenta de nuevo.", variant: "destructive" });
    }
  };

  // Filtro por anunciante ("Ver todos sus avisos" del detalle): si la URL trae
  // ?owner=<id> mostramos solo los avisos de ese anunciante.
  const owner = params.get("owner") || "";

  // Búsqueda en vivo: filtra a medida que se escribe / cambian filtros (debounce 250 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      const load = owner
        ? fetchListingsByOwner(owner)
        : searchListings({
            q: q || undefined,
            category: category || undefined,
            priceMin: priceMin ? Number(priceMin) : undefined,
            priceMax: priceMax ? Number(priceMax) : undefined,
            sort,
          });
      load.then((rows) => {
        setListings(rows);
        setActive(rows[0]?.id ?? null);
      });
    }, owner ? 0 : 250);
    return () => clearTimeout(t);
  }, [q, category, priceMin, priceMax, sort, owner]);

  const applyFilters = () => setShowFilters(false);

  const switchView = (v: ViewMode) => {
    setView(v);
    const next = new URLSearchParams(params);
    if (v === "map") next.set("view", "map");
    else next.delete("view");
    setParams(next, { replace: true });
  };

  const ViewToggle = (
    <div className="flex items-center gap-1 border border-border rounded-full p-0.5 shrink-0">
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
  );

  const FilterBar = useMemo(
    () => (
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 md:px-6 py-3 space-y-2 md:space-y-0">
          {/* Top row: filtros + toggle (siempre visibles, sin scroll) */}
          <div className="flex items-center gap-3 md:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(true)}
              className="gap-2 rounded-full shrink-0"
            >
              <SlidersHorizontal size={14} /> Filtros
            </Button>
            <div className="ml-auto">{ViewToggle}</div>
          </div>

          {/* Categories row (scrollable) + en desktop, todo en una sola línea */}
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(true)}
              className="gap-2 rounded-full shrink-0 hidden md:inline-flex"
            >
              <SlidersHorizontal size={14} /> Filtros
            </Button>
            {categories.slice(0, 6).map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory((prev) => (prev === c.id ? "" : c.id))}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border rounded-full transition-colors shrink-0 ${
                  category === c.id
                    ? "border-secondary text-secondary"
                    : "border-border hover:border-secondary hover:text-secondary"
                }`}
              >
                <c.icon size={12} /> {c.name}
              </button>
            ))}
            <div className="ml-auto hidden md:block">{ViewToggle}</div>
          </div>
        </div>
      </div>
    ),
    [view, params, category]
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
        <Select value={category || undefined} onValueChange={setCategory}>
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
          <Input type="number" placeholder="0" className="mt-1.5 rounded-none"
            value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Precio max</label>
          <Input type="number" placeholder="Sin límite" className="mt-1.5 rounded-none"
            value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Ubicación</label>
        <Input placeholder="Ej: Lima, Miraflores" className="mt-1.5 rounded-none" />
      </div>
      <div>
        <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Ordenar por</label>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="mt-1.5 rounded-none"><SelectValue placeholder="Más recientes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Más recientes</SelectItem>
            <SelectItem value="price_asc">Precio: menor a mayor</SelectItem>
            <SelectItem value="price_desc">Precio: mayor a menor</SelectItem>
            <SelectItem value="views">Más vistos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button className="w-full rounded-none" size="sm" onClick={applyFilters}>Aplicar filtros</Button>
      <Button variant="outline" className="w-full rounded-none gap-2" size="sm" onClick={saveCurrentSearch}>
        <Bookmark size={14} /> Guardar búsqueda
      </Button>
    </div>
  );

  return (
    <div className={`${view === "map" ? "h-screen" : "min-h-screen"} flex flex-col bg-background`}>
      <Navbar />

      {/* Búsqueda en vivo (filtra mientras escribes) */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center bg-muted/50 border border-border h-11 max-w-2xl focus-within:border-secondary/40 focus-within:bg-card transition-colors">
            <Search size={16} className="ml-3 text-muted-foreground shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca por título, descripción o ubicación…"
              className="flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="px-3 text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Limpiar búsqueda"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {FilterBar}

      {owner && (
        <div className="container mx-auto px-4 md:px-6 pt-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-secondary/30 bg-secondary/5 px-4 py-3">
            <p className="text-sm text-foreground">
              Mostrando todos los avisos de{" "}
              <span className="font-bold">{listings[0]?.advertiser || "este anunciante"}</span>
            </p>
            <button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("owner");
                setParams(next);
              }}
              className="text-xs font-semibold text-secondary hover:underline shrink-0"
            >
              Quitar filtro
            </button>
          </div>
        </div>
      )}

      {view === "list" ? (
        <div className="container mx-auto px-4 md:px-6 pt-8 pb-28 lg:pb-8 flex-1">
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
            <aside className="hidden lg:block w-72 flex-shrink-0">
              {FiltersPanel}
            </aside>

            <div className="flex-1 min-w-0">
              {listings.length === 0 ? (
                <div className="border border-dashed border-border py-20 text-center">
                  <p className="text-muted-foreground">No se encontraron avisos con estos filtros.</p>
                </div>
              ) : (
                <div
                  className={
                    layout === "grid"
                      ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 5xl:grid-cols-8 6xl:grid-cols-10 gap-5"
                      : "space-y-4"
                  }
                >
                  {listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} layout={layout} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[480px_1fr] min-h-0">
          {/* Map - full width on top in mobile, right column on desktop */}
          <div className="relative bg-muted overflow-hidden h-[55vh] lg:h-auto lg:order-2 shrink-0">
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
                  to={session?.supabase ? `/aviso/${l.id}` : `/auth?redirect=/aviso/${l.id}`}
                  onMouseEnter={() => setActive(l.id)}
                  onClick={(e) => {
                    if (window.innerWidth < 1024 && !isActive) {
                      e.preventDefault();
                      setActive(l.id);
                    }
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: pos.x, top: pos.y, zIndex: isActive ? 30 : 10 }}
                >
                  <div
                    className={`px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-full text-[11px] lg:text-xs font-bold shadow-lg transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground scale-110 ring-4 ring-primary/20"
                        : "bg-secondary text-secondary-foreground ring-2 lg:ring-4 ring-secondary/20 hover:scale-110"
                    }`}
                  >
                    {formatPrice(l.price, l.currency)}
                  </div>
                  {isActive && (
                    <div className="hidden lg:block absolute top-full left-1/2 -translate-x-1/2 mt-3 w-64 bg-card border border-border shadow-2xl overflow-hidden animate-fade-in">
                      <div className="aspect-[4/3] bg-muted">
                        <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-3">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-secondary">
                          {l.category}
                        </span>
                        <h4 className="text-sm font-semibold text-foreground line-clamp-1 mt-1">{l.title}</h4>
                        {session?.supabase ? (
                          <p className="text-base font-extrabold text-primary mt-1">
                            {formatPrice(l.price, l.currency)}
                          </p>
                        ) : (
                          <p className="text-xs text-secondary font-semibold mt-1">Ver detalle</p>
                        )}
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

          {/* List - below map on mobile, left column on desktop */}
          <div className="flex-1 lg:flex-none overflow-y-auto lg:border-r border-border bg-background lg:order-1 min-h-0">
            <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
              <p className="text-[10px] lg:text-xs uppercase tracking-[0.2em] font-bold text-secondary">Resultados</p>
              <h1 className="text-base lg:text-lg font-bold text-foreground mt-0.5 lg:mt-1">
                {listings.length} avisos en el mapa
              </h1>
            </div>
            <div className="divide-y divide-border">
              {listings.map((l) => (
                <Link
                  key={l.id}
                  to={session?.supabase ? `/aviso/${l.id}` : `/auth?redirect=/aviso/${l.id}`}
                  onMouseEnter={() => setActive(l.id)}
                  className={`flex gap-3 lg:gap-4 p-3 lg:p-4 transition-colors ${
                    active === l.id ? "bg-muted/60" : "hover:bg-muted/40"
                  }`}
                >
                  <div
                    className="w-24 lg:w-32 shrink-0 bg-muted overflow-hidden"
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
                      {session?.supabase && (
                        <>
                          <Star size={11} className="text-secondary fill-secondary" />
                          <span className="font-semibold text-foreground">0.0</span>
                          <span>·</span>
                        </>
                      )}
                      <span className="truncate">
                        <MapPin size={10} className="inline" /> {l.location}
                      </span>
                    </div>
                    {session?.supabase ? (
                      <p className="text-base font-extrabold text-primary mt-2">
                        {formatPrice(l.price, l.currency)}
                      </p>
                    ) : (
                      <p className="text-[11px] text-secondary font-semibold mt-2">Ver detalle</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile filters drawer (funciona en vistas lista y mapa) */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0 overflow-y-auto lg:hidden">
          <SheetHeader className="p-5 border-b">
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="p-4">{FiltersPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
