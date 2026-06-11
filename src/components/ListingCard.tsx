import { MapPin, Eye, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Listing } from "@/data/mockData";

interface ListingCardProps {
  listing: Listing;
  layout?: "grid" | "list";
}

export function ListingCard({ listing, layout = "grid" }: ListingCardProps) {
  const formatPrice = (price: number, currency: string) => {
    return currency === "USD" ? `US$ ${price.toLocaleString()}` : `S/ ${price.toLocaleString()}`;
  };

  if (layout === "list") {
    return (
      <div className="flex gap-4 bg-card rounded-2xl border p-3 listing-shadow card-lift cursor-pointer group">
        <div className="relative w-40 flex-shrink-0 overflow-hidden rounded-xl" style={{ aspectRatio: "16 / 9" }}>
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors truncate">
              {listing.title}
            </h3>
            {listing.featured && (
              <Badge className="bg-secondary text-secondary-foreground flex-shrink-0">Destacado</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{listing.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin size={12} />{listing.location}</span>
            <span className="flex items-center gap-1"><Eye size={12} />{listing.views}</span>
            <span className="flex items-center gap-1"><Clock size={12} />{listing.date}</span>
          </div>
          <p className="text-xl font-extrabold text-secondary mt-2">{formatPrice(listing.price, listing.currency)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border overflow-hidden listing-shadow card-lift cursor-pointer group">
      <div className="relative overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
        <img
          src={listing.imageUrl}
          alt={listing.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />
        {listing.featured && (
          <Badge className="absolute top-3 left-3 bg-secondary text-secondary-foreground shadow-md">Destacado</Badge>
        )}
        {listing.category && (
          <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold tracking-wide">
            {listing.category}
          </span>
        )}
      </div>
      <div className="p-5 space-y-2">
        <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors truncate">
          {listing.title}
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">{listing.description}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin size={12} />
          <span>{listing.location}</span>
        </div>
        <div className="flex items-center justify-between pt-2">
          <p className="text-xl font-extrabold text-secondary">{formatPrice(listing.price, listing.currency)}</p>
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Eye size={12} />{listing.views}</span>
        </div>
      </div>
    </div>
  );
}
