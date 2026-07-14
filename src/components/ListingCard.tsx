import { useEffect, useState } from "react";
import { MapPin, Heart, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Listing } from "@/data/mockData";
import { useSession } from "@/hooks/useSession";
import { useFavorites } from "@/hooks/useFavorites";
import { listingBadges } from "@/lib/listingBadges";
import { urgentTimeLeft } from "@/lib/listings";

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
  // decorativas, como el corazón de favoritos. Van como ICONO compacto para no
  // pisarse entre sí ni con "Verificado"; el nombre sale al pasar el mouse.
  // Colores oficiales (dorado / rojo / celeste) en @/lib/listingBadges.
  const badgeDefs = listingBadges(listing);

  // Cuenta regresiva del adicional "Urgente": horas que le quedan al aviso.
  // Solo tickeamos (cada minuto) si el aviso es urgente y tiene vencimiento.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!listing.urgent || !listing.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [listing.urgent, listing.expiresAt]);
  const urgent = listing.urgent ? urgentTimeLeft(listing.expiresAt ?? null, now) : null;

  // Los chips (icono + tooltip). El contenedor decide la dirección: en el grid
  // van en columna por la izquierda (no crecen hacia "Verificado"); en la lista,
  // en fila junto al título. En "Urgente" el chip crece para mostrar el contador.
  const badgeChips = badgeDefs.length > 0 && (
    <TooltipProvider delayDuration={100}>
      {badgeDefs.map(({ key, label, icon: Icon, cls }) => {
        const showCount = key === "urgent" && urgent && !urgent.expired;
        return (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <span
                aria-label={showCount ? `${label} · quedan ${urgent!.short}` : label}
                onClick={(e) => e.stopPropagation()}
                className={`h-7 flex items-center justify-center gap-1 shadow-md ${showCount ? "px-1.5 w-auto" : "w-7"} ${cls}`}
              >
                <Icon size={14} />
                {showCount && (
                  <span className="text-[11px] font-bold leading-none tabular-nums">{urgent!.short}</span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>{showCount ? `Urgente · quedan ${urgent!.long}` : label}</TooltipContent>
          </Tooltip>
        );
      })}
    </TooltipProvider>
  );

  // Destacado = "marco dorado" + fondo ligeramente distinto (documento eFFe).
  // Solo estético; la insignia sigue indicando la modalidad.
  const featured = !!listing.featured;

  if (layout === "list") {
    return (
      <div role="link" tabIndex={0} onClick={goToDetail} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goToDetail()} className={`flex gap-4 p-3 hover:shadow-lg transition-all cursor-pointer group ${featured ? "bg-amber-50/50 border-2 border-amber-400 hover:border-amber-500" : "bg-card border border-border hover:border-secondary/40"}`}>
        <div className="relative w-40 flex-shrink-0 overflow-hidden bg-muted" style={{ aspectRatio: "4 / 3" }}>
          <img src={listing.imageUrl} alt={listing.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" loading="lazy" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors truncate">{listing.title}</h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">{badgeChips}</div>
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
    <div role="link" tabIndex={0} onClick={goToDetail} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && goToDetail()} className={`group cursor-pointer flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 ${featured ? "bg-amber-50/50 border-2 border-amber-400 ring-1 ring-amber-300/60 hover:border-amber-500" : "bg-card border border-border/70 hover:border-secondary/40"}`}>

      {/* Image — taller, near-square for a premium presence */}
      <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: "1 / 1" }}>
        <img
          src={listing.imageUrl}
          alt={listing.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
        />
        {/* Insignias — iconos apilados por la izquierda (nombre en el tooltip).
            En columna para no crecer hacia el badge "Verificado" de la derecha. */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {badgeChips}
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
            {/* Ubicación */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
