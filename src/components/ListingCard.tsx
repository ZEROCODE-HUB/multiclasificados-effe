import { useEffect, useState } from "react";
import { MapPin, Heart, ShieldCheck, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Listing } from "@/data/mockData";
import { useSession } from "@/hooks/useSession";
import { useFavorites } from "@/hooks/useFavorites";
import { listingBadges } from "@/lib/listingBadges";
import { urgentTimeLeft } from "@/lib/listings";
import { imgUrl, imgSrcSet } from "@/lib/imageUrl";
import { formatPrecioAviso } from "@/lib/pricing";
import { ubicacionConPais } from "@/lib/paises";
import { CuerpoDeAviso } from "@/components/CuerpoDeAviso";
import { marcoDeAviso } from "@/lib/estiloDeAviso";

interface ListingCardProps {
  listing: Listing;
  layout?: "grid" | "list";
}

export function ListingCard({ listing, layout = "grid" }: ListingCardProps) {
  const navigate = useNavigate();
  const session = useSession();
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(listing.id);

  const isAuthed = !!session?.supabase;
  // El aviso es PÚBLICO: la tarjeta lleva directo a la ficha, con o sin sesión.
  // Antes pasaba por el login, lo que dejaba el escaparate a la vista y la
  // puerta cerrada. Las acciones (contactar, teléfono, guardar…) siguen pidiendo
  // cuenta cada una por su lado, dentro de la ficha.
  const detailUrl = `/aviso/${listing.id}`;
  const goToDetail = () => navigate(detailUrl);

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

  // Insignias visuales del aviso (adicionales que pagó el anunciante). Solo
  // decorativas, como el corazón de favoritos. Van como ICONO compacto para no
  // pisarse entre sí ni con "Verificado"; el nombre sale al pasar el mouse.
  // Colores oficiales (dorado / rojo / celeste) en @/lib/listingBadges.
  // "Destacado" NO lleva chip en la tarjeta: el marco dorado ya lo dice, y el
  // icono era la misma información contada dos veces en el sitio donde menos
  // sitio hay. En la ficha del aviso sí sigue, que allí no compite con nada.
  // Se conserva para lectores de pantalla más abajo, que a esos el color no
  // les dice nada.
  const badgeDefs = listingBadges(listing).filter((b) => b.key !== "featured");

  // Cuenta regresiva del adicional "Urgente": horas que le quedan al aviso.
  // Solo tickeamos (cada minuto) si el aviso es urgente y tiene vencimiento.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!listing.urgent || !listing.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [listing.urgent, listing.expiresAt]);
  const urgent = listing.urgent ? urgentTimeLeft(listing.expiresAt ?? null, now) : null;

  // Los chips (icono + tooltip) DEL LAYOUT "list", que va en fila junto al
  // título. Los del grid los pinta CuerpoDeAviso, que es el que comparten la
  // tarjeta y la ficha del pin del mapa.
  const badgeChips = badgeDefs.length > 0 && (
    <TooltipProvider delayDuration={100}>
      {badgeDefs.map(({ key, label, icon: Icon, cls }) => {
        const showCount = key === "urgent" && urgent && !urgent.expired;
        // El latido solo mientras el plazo SIGUE corriendo. Un "Urgente" ya
        // vencido latiendo sería una llamada de atención a algo que no la
        // merece — y el chip se queda quieto en cuanto expira.
        const late = key === "urgent" && urgent && !urgent.expired;
        return (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <span
                // role="img": el chip es un icono cuyo significado lo da el
                // aria-label; sin un rol válido, un <span aria-label> dispara el
                // fallo de accesibilidad de Lighthouse (IT2-001).
                role="img"
                aria-label={showCount ? `${label} · quedan ${urgent!.short}` : label}
                onClick={(e) => e.stopPropagation()}
                className={`h-7 shrink-0 flex items-center justify-center gap-1 shadow-md ${showCount ? "px-1.5 w-auto" : "w-7"} ${late ? "motion-safe:animate-latido-urgente" : ""} ${cls}`}
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
    // EFFE-014: enlace real (<a>). Este layout no tiene botones anidados (las
    // insignias son <span>), así que la card entera puede ser el enlace.
    // Sin halo: en la lista las filas van pegadas y el anillo exterior se
    // comería la separación. Es el mismo dorado por lo demás.
    return (
      <Link to={detailUrl} aria-label={listing.title} className={`no-underline text-inherit flex gap-4 p-3 hover:shadow-lg transition-all cursor-pointer group ${marcoDeAviso(featured, false)}`}>
        {featured && <span className="sr-only">Aviso destacado</span>}
        <div className="relative w-40 flex-shrink-0 overflow-hidden bg-muted" style={{ aspectRatio: "4 / 3" }}>
          {/* La miniatura se muestra a 160 px: pedimos ese tamaño, no el original. */}
          <img src={imgUrl(listing.imageUrl, 200)} srcSet={imgSrcSet(listing.imageUrl, 200)} sizes="160px" alt={listing.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" loading="lazy" decoding="async" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground group-hover:text-secondary transition-colors truncate">{listing.title}</h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">{badgeChips}</div>
          </div>
          {/* Contenido detallado solo para usuarios con sesión */}
          {isAuthed && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{listing.description}</p>}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin size={12} />{ubicacionConPais(listing.location, listing.country)}</span>
          </div>
          {isAuthed ? (
            <p className="text-lg font-extrabold text-primary mt-2">{formatPrecioAviso(listing.price, listing.currency)}</p>
          ) : (
            <p className="text-sm text-secondary font-semibold mt-2 group-hover:underline">Ver detalle</p>
          )}
        </div>
      </Link>
    );
  }


  return (
    <CuerpoDeAviso
      l={listing}
      anchoImagen={400}
      sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
      urgente={urgent}
      /* Sin sesion no se ensena el precio. La ficha del pin del mapa hace lo
         mismo: si no, cualquiera sin cuenta veria los precios pulsando pines. */
      mostrarPrecio={isAuthed}
      className="cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5"
      /* EFFE-014: enlace real que cubre toda la card (stretched link). Los
         controles (favorito, insignias con tooltip, CTA) van con z-10 por
         encima y como HERMANOS del enlace, para no anidar botones en un <a>. */
      cobertura={<Link to={detailUrl} aria-label={listing.title} className="absolute inset-0 z-[1]" />}
      accionEsquina={
        <button
          onClick={handleFav}
          /* El cuadro sigue midiendo 32 px, pero el pseudo-elemento amplia la
             zona sensible a los 44 px que piden las guias de iOS y Android,
             sin cambiar el diseno de la tarjeta. */
          className="absolute top-3 right-3 z-10 w-8 h-8 bg-white/95 backdrop-blur-sm flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm before:absolute before:-inset-1.5 before:content-['']"
          aria-label="Guardar en favoritos"
        >
          <Heart size={15} className={fav ? "text-secondary fill-secondary" : "text-primary"} />
        </button>
      }
      pie={
        /* CTA - mismo boton para todos; si no hay sesion, lleva al login.
           Oculto en movil: la tarjeta entera YA es un enlace que la cubre, asi
           que ahi el boton repetia el mismo destino a cambio de 32 px de alto
           por tarjeta. En escritorio se queda: hay espacio y acompana al hover. */
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); goToDetail(); }}
          className="relative z-10 w-full mt-auto h-8 text-xs font-semibold border-border hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all rounded-none hidden sm:inline-flex"
        >
          Ver detalle
        </Button>
      }
    />
  );
}
