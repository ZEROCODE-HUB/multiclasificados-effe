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

  // Los chips (icono + tooltip). El contenedor decide la dirección: en el grid
  // van en columna por la izquierda (no crecen hacia "Verificado"); en la lista,
  // en fila junto al título. En "Urgente" el chip crece para mostrar el contador.
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
    return (
      <Link to={detailUrl} aria-label={listing.title} className={`no-underline text-inherit flex gap-4 p-3 hover:shadow-lg transition-all cursor-pointer group ${featured ? "bg-amber-50 border-2 border-amber-500 hover:border-amber-600" : "bg-card border border-border hover:border-secondary/40"}`}>
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
    /* El dorado del destacado sube de tono porque ahora carga solo: al quitarle
       el icono, el marco es lo ÚNICO que distingue un aviso pagado. Antes el
       fondo iba al 50 % de opacidad y el borde en amber-400, que sobre blanco
       se leía como un matiz, no como una distinción.
       El halo exterior es lo que más lo separa de sus vecinos sin ensuciar la
       tarjeta por dentro; cabe porque la rejilla deja 12 px de separación. */
    <div className={`group relative cursor-pointer flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 ${featured ? "bg-amber-50 border-2 border-amber-500 ring-2 ring-amber-400/40 shadow-md shadow-amber-500/20 hover:border-amber-600 hover:shadow-amber-500/40" : "bg-card border border-border/70 hover:border-secondary/40"}`}>
      {/* El color no es información para todo el mundo: quien use lector de
          pantalla o no distinga el dorado se quedaba sin saberlo al retirar el
          icono. */}
      {featured && <span className="sr-only">Aviso destacado</span>}
      {/* EFFE-014: enlace real que cubre toda la card (stretched link). Los
          controles (favorito, insignias con tooltip, CTA) van con z-10 por encima
          y como HERMANOS del enlace, para no anidar botones dentro de un <a>. */}
      <Link to={detailUrl} aria-label={listing.title} className="absolute inset-0 z-[1]" />

      {/* Insignias, "Verificado" y favorito: overlays por ENCIMA del enlace. Como
          hijos del wrapper (no del contenedor de la imagen) para no quedar
          atrapados debajo del enlace por el stacking context de la imagen. */}
      {/* items-start + w-fit: los chips (de anchos distintos cuando "Urgente"
          muestra el contador) quedan alineados por su borde izquierdo en vez de
          descuadrados (IT2-031). */}
      {/* max-w: reserva el hueco del escudo + el corazón, que van fijos a la
          derecha. Sin él, con 3 o más insignias el bloque izquierdo crecía
          hasta encimarse con ellos.

          Bajado de 8.5rem a 5.5rem al quitarle el texto al sello: ahora los dos
          controles de la derecha ocupan 80 px (corazón de 12 a 44, escudo de 48
          a 80) más un margen. Con el valor viejo, en una tarjeta de 158 px el
          bloque izquierdo se quedaba en 22 px y los chips no cabían. */}
      <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5 w-fit max-w-[calc(100%-5.5rem)]">
        {badgeChips}
      </div>
      {/* El "tiene video" ya no vive aquí: estaba anclado al fondo del WRAPPER
          —que es imagen + textos— así que su `bottom-3` no caía sobre la foto
          sino sobre el precio. Ahora va dentro del contenedor de la imagen,
          más abajo. */}
      {/* Solo si el equipo de administración verificó al anunciante. Antes salía
          en todas las tarjetas sin condición: decoración con pinta de dato.

          SIN LA PALABRA "Verificado": el chip con texto medía unos 95 px y,
          anclado a 48 px del borde derecho, ocupaba 143 de los ~158 px que mide
          una tarjeta cuando van dos por fila. Se comía la tarjeta entera y se
          encimaba con los distintivos de la izquierda.

          Que el escudo solo no se explique a sí mismo se compensa donde sí hay
          sitio: la ficha del aviso lo dice con todas las letras ("Verificado
          eFFe", "Anunciante verificado y avalado por eFFe"). Aquí van el
          aria-label y el tooltip, que es como ya funcionan los otros chips. */}
      {listing.advertiserVerified && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="img"
                aria-label="Anunciante verificado por eFFe"
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3 right-12 z-10 w-8 h-8 bg-white/95 backdrop-blur-sm flex items-center justify-center text-primary shadow-sm"
              >
                <ShieldCheck size={15} />
              </span>
            </TooltipTrigger>
            <TooltipContent>Anunciante verificado por eFFe</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <button
        onClick={handleFav}
        /* El cuadro sigue midiendo 32px, pero el pseudo-elemento amplía la zona
           sensible a los 44px que piden las guías de iOS y Android, sin cambiar
           el diseño de la tarjeta. */
        className="absolute top-3 right-3 z-10 w-8 h-8 bg-white/95 backdrop-blur-sm flex items-center justify-center hover:bg-white hover:scale-110 transition-all shadow-sm before:absolute before:-inset-1.5 before:content-['']"
        aria-label="Guardar en favoritos"
      >
        <Heart size={15} className={fav ? "text-secondary fill-secondary" : "text-primary"} />
      </button>

      {/* Image — 4:3 (más baja que el cuadrado anterior) para tarjetas más
          compactas y ver más avisos por pantalla. */}
      <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: "4 / 3" }}>
        <img
          src={imgUrl(listing.imageUrl, 400)}
          srcSet={imgSrcSet(listing.imageUrl, 400)}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          alt={listing.title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
        />
        {/* "Tiene video": un dato que cambia si vale la pena entrar, y se ve sin
            cargar nada. Va DENTRO de la imagen (antes colgaba del wrapper y
            aterrizaba sobre el precio) y en la esquina de abajo a la derecha,
            que es donde el ojo ya la busca por YouTube y compañía.

            Solo el icono: la palabra "VIDEO" en mayúsculas sobre negro sólido
            pesaba más que el propio aviso. El aria-label mantiene el dato para
            quien no ve el icono. */}
        {(listing.videoCount ?? 0) > 0 && (
          <span
            role="img"
            aria-label="Este aviso incluye video"
            className="absolute bottom-1.5 right-1.5 z-10 flex items-center justify-center w-6 h-6 bg-black/55 backdrop-blur-[2px] text-white/95"
          >
            <Video size={12} />
          </span>
        )}
      </div>

      {/* Content — espaciado compacto (gap/padding reducidos) para ganar densidad.
          flex-1 + min-w-0: en WebKit los nodos de texto con line-clamp variaban
          de alto y descuadraban precios e insignias entre tarjetas vecinas; con
          esto el bloque ocupa el alto sobrante y el CTA queda siempre al ras. */}
      <div className="flex flex-col gap-1 sm:gap-1.5 p-2 sm:p-3 flex-1 min-w-0">
        {/* truncate: con dos tarjetas por fila caben ~158 px, y categorías como
            "Vehículos y Repuestos" con este espaciado se salían del recuadro. */}
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-secondary truncate">{listing.category}</span>
        <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors min-h-[2.25rem]">
          {listing.title}
        </h3>

        {isAuthed ? (
          <>
            {/* Ubicación */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 truncate"><MapPin size={11} />{ubicacionConPais(listing.location, listing.country)}</span>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <p className="text-base font-extrabold text-primary tracking-tight">{formatPrecioAviso(listing.price, listing.currency)}</p>
            </div>
          </>
        ) : (
          /* Visibilidad restringida para no logueados: solo ciudad */
          <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <MapPin size={11} />{ubicacionConPais(listing.location, listing.country)}
          </div>
        )}

        {/* CTA — mismo botón para todos; si no hay sesión, lleva al login.
            Oculto en móvil: la tarjeta entera YA es un enlace que la cubre
            (el <Link absolute inset-0 de arriba), así que ahí el botón repetía
            el mismo destino a cambio de 32 px de alto por tarjeta — con dos
            columnas y varias filas en pantalla, eso es mucho sitio por nada.
            En escritorio se queda: hay espacio y acompaña al hover. */}
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); goToDetail(); }}
          className="relative z-10 w-full mt-auto h-8 text-xs font-semibold border-border hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all rounded-none hidden sm:inline-flex"
        >
          Ver detalle
        </Button>
      </div>
    </div>
  );
}
