import { MapPin, Heart, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Listing } from "@/data/mockData";

interface ListingCardProps {
  listing: Listing;
  layout?: "grid" | "list";
}

export function ListingCard({ listing, layout = "grid" }: ListingCardProps) {
  const formatPrice = (price: number, currency: string) =>
    currency === "USD" ? `US$ ${price.toLocaleString()}` : `S/ ${price.toLocaleString()}`;

  if (layout === "list") {
    return (
      <div className="flex gap-4 bg-card rounded-2xl border p-3 hover:border-secondary/40 hover:shadow-lg transition-all cursor-pointer group">
        <div className="relative w-40 flex-shrink-0 overflow-hidden rounded-xl" style={{ aspectRatio: "4 / 3" }}>
          <img src={listing.imageUrl} alt={listing.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors truncate">{listing.title}</h3>
            {listing.featured && <Badge className="bg-secondary text-secondary-foreground flex-shrink-0">Destacado</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{listing.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin size={12} />{listing.location}</span>
          </div>
          <p className="text-xl font-extrabold text-primary mt-2">{formatPrice(listing.price, listing.currency)}</p>
        </div>
      </div>
    );
  }

  return (
    <article className="group cursor-pointer">
      {/* Image */}
      <div className="relative overflow-hidden rounded-2xl bg-muted" style={{ aspectRatio: "4 / 3" }}>
        <img
          src={listing.imageUrl}
          alt={listing.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
        />
        {/* Top badges */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {listing.featured && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-[10px] font-bold uppercase tracking-wider shadow-md">
              Destacado
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-sm text-primary text-[10px] font-bold uppercase tracking-wider">
            <ShieldCheck size={10} /> Verificado
          </span>
        </div>
        {/* Favorite */}
        <button
          onClick={(e) => { e.stopPropagation(); }}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-md"
          aria-label="Guardar en favoritos"
        >
          <Heart size={15} className="text-primary" />
        </button>
      </div>

      {/* Content */}
      <div className="pt-4 px-1 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-secondary">{listing.category}</span>
          <span className="text-[11px] text-muted-foreground">{listing.location}</span>
        </div>
        <h3 className="font-semibold text-foreground text-[15px] leading-snug line-clamp-2 group-hover:text-secondary transition-colors min-h-[2.5rem]">
          {listing.title}
        </h3>
        <div className="flex items-baseline gap-1.5 pt-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Desde</span>
          <p className="text-xl font-extrabold text-primary tracking-tight">{formatPrice(listing.price, listing.currency)}</p>
        </div>
      </div>
    </article>
  );
}
