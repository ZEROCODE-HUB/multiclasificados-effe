import { MapPin, Heart, ShieldCheck, Star, Flame, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Listing } from "@/data/mockData";
import { useSession } from "@/hooks/useSession";
import { useFavorites } from "@/hooks/useFavorites";

interface ListingCardProps {
  listing: Listing;
  layout?: "grid" | "list";
}

export function ListingCard({ listing, layout = "grid" }: ListingCardProps) {
  const navigate = useNavigate();
  const session = useSession();
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(listing.id);

  // Solo los usuarios con sesión real pueden ver el detalle.
  const isAuthed = !!session?.supabase;
  const goToDetail = () => {
    if (!isAuthed) {
      navigate(`/auth?redirect=/aviso/${listing.id}`);
      return;
    }
    navigate(`/aviso/${listing.id}`);
  };

  const handleFav = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthed) {
      toast.error("Inicia sesión para guardar favoritos");
      navigate("/auth");
      return;
    }
    try {
      const res = await toggle(listing.id);
      if (res === null) {
        toast.message("Disponible con avisos reales");
        return;
      }
      toast.success(res ? "Guardado en favoritos" : "Quitado de favoritos");
    } catch {
      toast.error("No se pudo actualizar el favorito");
    }
  };
  const formatPrice = (price: number, currency: string) =>
    currency === "USD" ? `US$ ${price.toLocaleString()}` : `S/ ${price.toLocaleString()}`;

  // Insignias visuales del aviso (adicionales que pagó el anunciante). Solo
  // decorativas, como el corazón de favoritos. Estilo de píldora para el grid.
  const pillBadges = (
    <>
      {listing.featured && (
        <span className="inline-flex items-center px-2.5 py-1 bg-secondary text-secondary-foreground text-[10px] font-bold uppercase tracking-wider shadow-md">
          Destacado
        </span>
      )}
      {listing.urgent && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-destructive text-destructive-foreground text-[10px] font-bold uppercase tracking-wider shadow-md">
          <Flame size={10} /> Urgente
        </span>
      )}
      {listing.confidential && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-md">
          <EyeOff size={10} /> Confidencial
        </span>
      )}
    </>
  );

  // Sin reseñas reales todavía → valores neutros
  const rating = "0.0";
  const reviews = 0;

  if (layout === "list") {
    return (
      <div role="link" tabIndex={0} onClick={goToDetail} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goToDetail()} className="flex gap-4 bg-card border border-border p-3 hover:border-secondary/40 hover:shadow-lg transition-all cursor-pointer group">
        <div className="relative w-40 flex-shrink-0 overflow-hidden bg-muted" style={{ aspectRatio: "4 / 3" }}>
          <img src={listing.imageUrl} alt={listing.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors truncate">{listing.title}</h3>
            <div className="flex flex-wrap items-center gap-1 flex-shrink-0">{pillBadges}</div>
          </div>
          {/* Contenido detallado solo para usuarios con sesión */}
          {isAuthed && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{listing.description}</p>}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin size={12} />{listing.location}</span>
          </div>
          {isAuthed ? (
            <p className="text-xl font-extrabold text-primary mt-2">{formatPrice(listing.price, listing.currency)}</p>
          ) : (
            <p className="text-sm text-secondary font-semibold mt-2 group-hover:underline">Ver detalle</p>
          )}
        </div>
      </div>
    );
  }


  return (
    <div role="link" tabIndex={0} onClick={goToDetail} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goToDetail()} className="group cursor-pointer flex flex-col bg-card border border-border/70 overflow-hidden transition-all duration-300 hover:border-secondary/40 hover:shadow-xl hover:-translate-y-0.5">

      {/* Image — taller, near-square for a premium presence */}
      <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: "1 / 1" }}>
        <img
          src={listing.imageUrl}
          alt={listing.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
        />
        {/* Top badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[calc(100%-5rem)]">
          {pillBadges}
        </div>
        <span className="absolute top-3 right-12 inline-flex items-center gap-1 px-2.5 py-1 bg-white/95 backdrop-blur-sm text-primary text-[10px] font-bold uppercase tracking-wider shadow-sm">
          <ShieldCheck size={10} /> Verificado
        </span>
        {/* Favorite */}
        <button
          onClick={handleFav}
          className="absolute top-3 right-3 w-8 h-8 bg-white/95 backdrop-blur-sm flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm"
          aria-label="Guardar en favoritos"
        >
          <Heart size={15} className={fav ? "text-secondary fill-secondary" : "text-primary"} />
        </button>

      </div>

      {/* Content — generous spacing */}
      <div className="flex flex-col gap-3 p-5">
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-secondary">{listing.category}</span>
        <h3 className="font-semibold text-foreground text-[15px] leading-snug line-clamp-2 group-hover:text-primary transition-colors min-h-[2.5rem]">
          {listing.title}
        </h3>

        {isAuthed ? (
          <>
            {/* Rating */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star size={12} className="text-secondary fill-secondary" />
                <span className="font-semibold text-foreground">{rating}</span>
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span>{reviews} reseñas</span>
              <span className="text-muted-foreground/60">·</span>
              <span className="flex items-center gap-1 truncate"><MapPin size={11} />{listing.location}</span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-extrabold text-primary tracking-tight">{formatPrice(listing.price, listing.currency)}</p>
            </div>
          </>
        ) : (
          /* Visibilidad restringida para no logueados: solo ciudad */
          <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <MapPin size={11} />{listing.location}
          </div>
        )}

        {/* CTA — mismo botón para todos; si no hay sesión, lleva al login */}
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); goToDetail(); }}
          className="w-full mt-1 font-semibold border-border hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all rounded-none"
        >
          Ver detalle
        </Button>
      </div>
    </div>
  );
}
