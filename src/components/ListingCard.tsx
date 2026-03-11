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
      <div className="flex gap-4 bg-card rounded-lg border p-3 hover:shadow-md transition-shadow cursor-pointer group">
        <img
          src={listing.imageUrl}
          alt={listing.title}
          className="w-40 h-28 object-cover rounded-md flex-shrink-0"
          loading="lazy"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors truncate">
              {listing.title}
            </h3>
            {listing.featured && (
              <Badge className="bg-secondary text-secondary-foreground flex-shrink-0">Destacado</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{listing.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin size={12} />{listing.location}</span>
            <span className="flex items-center gap-1"><Eye size={12} />{listing.views}</span>
            <span className="flex items-center gap-1"><Clock size={12} />{listing.date}</span>
          </div>
          <p className="text-lg font-bold text-secondary mt-2">{formatPrice(listing.price, listing.currency)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group">
      <div className="relative">
        <img
          src={listing.imageUrl}
          alt={listing.title}
          className="w-full h-48 object-cover"
          loading="lazy"
        />
        {listing.featured && (
          <Badge className="absolute top-2 left-2 bg-secondary text-secondary-foreground">Destacado</Badge>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors truncate">
          {listing.title}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{listing.description}</p>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <MapPin size={12} />
          <span>{listing.location}</span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <p className="text-lg font-bold text-secondary">{formatPrice(listing.price, listing.currency)}</p>
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Eye size={12} />{listing.views}</span>
        </div>
      </div>
    </div>
  );
}
