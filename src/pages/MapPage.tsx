import { Navbar } from "@/components/Navbar";
import { featuredListings, categories } from "@/data/mockData";
import { MapPin, ShieldCheck, Heart, Star, SlidersHorizontal, List, Map as MapIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function MapPage() {
  const [active, setActive] = useState<string | null>(featuredListings[0]?.id ?? null);
  const formatPrice = (price: number, currency: string) =>
    currency === "USD" ? `US$ ${(price / 1000).toFixed(0)}K` : `S/ ${price.toLocaleString()}`;

  const pinPositions = [
    { x: "22%", y: "28%" },
    { x: "48%", y: "42%" },
    { x: "65%", y: "30%" },
    { x: "35%", y: "60%" },
    { x: "72%", y: "62%" },
    { x: "55%", y: "75%" },
  ];

  return (
    <div className="h-screen flex flex-col bg-background">
      <Navbar />

      {/* Filter bar */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 md:px-6 py-3 flex items-center gap-3 overflow-x-auto">
          <Button variant="outline" size="sm" className="gap-2 rounded-full shrink-0">
            <SlidersHorizontal size={14} /> Filtros
          </Button>
          {categories.slice(0, 6).map((c) => (
            <button key={c.id} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-full hover:border-secondary hover:text-secondary transition-colors shrink-0">
              <c.icon size={12} /> {c.name}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 border border-border rounded-full p-0.5 shrink-0">
            <button className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full text-muted-foreground hover:text-foreground"><List size={12} className="inline mr-1" /> Lista</button>
            <button className="px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-primary text-primary-foreground"><MapIcon size={12} className="inline mr-1" /> Mapa</button>
          </div>
        </div>
      </div>

      {/* Split view */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[480px_1fr] min-h-0">
        {/* List */}
        <div className="overflow-y-auto border-r border-border bg-background">
          <div className="px-5 py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-secondary">Resultados</p>
            <h1 className="text-lg font-bold text-foreground mt-1">{featuredListings.length} avisos en el mapa</h1>
          </div>
          <div className="divide-y divide-border">
            {featuredListings.map((l) => (
              <Link
                key={l.id}
                to={`/aviso/${l.id}`}
                onMouseEnter={() => setActive(l.id)}
                className={`flex gap-4 p-4 transition-colors ${active === l.id ? "bg-muted/60" : "hover:bg-muted/40"}`}
              >
                <div className="w-32 shrink-0 bg-muted overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                  <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-secondary">{l.category}</span>
                    <button onClick={(e) => { e.preventDefault(); }} className="text-muted-foreground hover:text-secondary"><Heart size={14} /></button>
                  </div>
                  <h3 className="font-semibold text-sm text-foreground line-clamp-2 mt-1">{l.title}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1.5">
                    <Star size={11} className="text-secondary fill-secondary" />
                    <span className="font-semibold text-foreground">4.8</span>
                    <span>·</span>
                    <span className="truncate"><MapPin size={10} className="inline" /> {l.location}</span>
                  </div>
                  <p className="text-base font-extrabold text-primary mt-2">{formatPrice(l.price, l.currency)}</p>
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

          {/* Decorative grid */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--primary)/.3) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary)/.3) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />

          {/* Pins */}
          {featuredListings.map((l, i) => {
            const pos = pinPositions[i % pinPositions.length];
            const isActive = active === l.id;
            return (
              <Link
                key={l.id}
                to={`/aviso/${l.id}`}
                onMouseEnter={() => setActive(l.id)}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: pos.x, top: pos.y, zIndex: isActive ? 30 : 10 }}
              >
                <div className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg transition-all ${isActive ? "bg-primary text-primary-foreground scale-110 ring-4 ring-primary/20" : "bg-secondary text-secondary-foreground ring-4 ring-secondary/20 hover:scale-110"}`}>
                  {formatPrice(l.price, l.currency)}
                </div>
                {isActive && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-64 bg-card border border-border shadow-2xl overflow-hidden animate-fade-in">
                    <div className="aspect-[4/3] bg-muted">
                      <img src={l.imageUrl} alt={l.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-secondary">{l.category}</span>
                      <h4 className="text-sm font-semibold text-foreground line-clamp-1 mt-1">{l.title}</h4>
                      <p className="text-base font-extrabold text-primary mt-1">{formatPrice(l.price, l.currency)}</p>
                    </div>
                  </div>
                )}
              </Link>
            );
          })}

          {/* Map attribution */}
          <div className="absolute bottom-3 right-3 px-2 py-1 bg-card/90 backdrop-blur text-[10px] text-muted-foreground rounded">
            Vista de mapa demo · Próximamente con datos reales
          </div>
        </div>
      </div>
    </div>
  );
}
