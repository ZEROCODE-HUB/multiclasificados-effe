// El aviso tal como se VE, sin nada que dependa del árbol de React.
//
// POR QUÉ EXISTE ESTE ARCHIVO
//
// Había dos tarjetas distintas para el mismo aviso: la del buscador
// (ListingCard) y la que sale al pulsar un pin del mapa (FichaDelPin). La
// segunda no tenía marco, la foto llevaba esquina redondeada —el resto de la
// app es recta— y le faltaban el destacado, el urgente, el confidencial, el
// sello y el video. Además abreviaba el precio: enseñaba "S/ 250K" donde la
// tarjeta decía "S/ 250,000.00".
//
// La respuesta evidente sería que el mapa usara ListingCard, y NO SE PUEDE: la
// ficha del pin se monta con `createRoot` sobre un nodo suelto que fabrica
// Google para el InfoWindow. Esa raíz no hereda ningún contexto —ni Router, ni
// sesión, ni favoritos—, y un `<Link>` allí aborta el render y deja la
// ventanita en blanco. Ya pasó en producción.
//
// De ahí la forma de este componente: pinta TODO lo visual y no llama a ningún
// hook de contexto. Lo que sí necesita contexto (el enlace que cubre la
// tarjeta, el botón de favorito, el CTA) entra por props, y lo pone quien puede
// permitírselo.
import type { ReactNode } from "react";
import { MapPin, ShieldCheck, Video } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { imgUrl, imgSrcSet } from "@/lib/imageUrl";
import { formatPrecioAviso } from "@/lib/pricing";
import { ubicacionConPais } from "@/lib/paises";
import { listingBadges } from "@/lib/listingBadges";
import { marcoDeAviso } from "@/lib/estiloDeAviso";

/** Lo mínimo que hace falta para pintar un aviso. */
export interface AvisoVisible {
  title: string;
  category: string;
  location: string;
  country?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  featured?: boolean;
  urgent?: boolean;
  confidential?: boolean;
  advertiserVerified?: boolean;
  videoCount?: number;
}

/** Cuenta atrás del "Urgente" ya formateada: la calcula quien tenga reloj. */
export interface CuentaAtras {
  short: string;
  long: string;
  expired: boolean;
}

interface Props {
  l: AvisoVisible;
  /** Ancho de imagen que se pide al servidor. */
  anchoImagen: number;
  /** Valor del atributo `sizes` de la foto. */
  sizes: string;
  urgente?: CuentaAtras | null;
  /** Con sesión se ve el precio; sin ella, solo la ubicación. */
  mostrarPrecio?: boolean;
  /** El enlace que cubre toda la tarjeta. Va aquí dentro y no envolviéndola
   *  porque su `absolute inset-0` necesita este marco como referencia; un div
   *  intermedio añadiría una capa y movería el marco de sitio. */
  cobertura?: ReactNode;
  /** Va sobre la esquina superior derecha de la foto (el favorito). */
  accionEsquina?: ReactNode;
  /** Va al final del bloque de texto (el CTA "Ver detalle"). */
  pie?: ReactNode;
  /** Clases extra para el marco exterior. */
  className?: string;
}

export function CuerpoDeAviso({
  l, anchoImagen, sizes, urgente, mostrarPrecio = true, cobertura, accionEsquina, pie, className = "",
}: Props) {
  // "Destacado" no lleva chip: el marco dorado ya lo dice, y el icono era la
  // misma información dos veces justo donde menos sitio hay.
  const chips = listingBadges(l).filter((b) => b.key !== "featured");
  const featured = !!l.featured;

  return (
    <div className={`group relative flex flex-col overflow-hidden ${marcoDeAviso(featured)} ${className}`}>
      {/* El color no es información para todo el mundo. */}
      {featured && <span className="sr-only">Aviso destacado</span>}

      {cobertura}

      {/* Distintivos, arriba a la izquierda y en columna.
          El max-w reserva el hueco de los dos controles de la derecha (el sello
          en right-12 y el favorito en right-3 ocupan 80 px): sin él, con tres
          distintivos el bloque crecía hasta encimarse con ellos. */}
      {chips.length > 0 && (
        <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5 w-fit max-w-[calc(100%-5.5rem)]">
          <TooltipProvider delayDuration={100}>
            {chips.map(({ key, label, icon: Icon, cls }) => {
              const cuenta = key === "urgent" && urgente && !urgente.expired;
              return (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    <span
                      // role="img": el chip es un icono cuyo significado lo da
                      // el aria-label; un span con aria-label y sin rol válido
                      // dispara el fallo de accesibilidad de Lighthouse.
                      role="img"
                      aria-label={cuenta ? `${label} · quedan ${urgente!.short}` : label}
                      onClick={(e) => e.stopPropagation()}
                      className={`h-7 shrink-0 flex items-center justify-center gap-1 shadow-md ${cuenta ? "px-1.5 w-auto" : "w-7"} ${cuenta ? "motion-safe:animate-latido-urgente" : ""} ${cls}`}
                    >
                      <Icon size={14} />
                      {cuenta && (
                        <span className="text-[11px] font-bold leading-none tabular-nums">{urgente!.short}</span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{cuenta ? `Urgente · quedan ${urgente!.long}` : label}</TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
      )}

      {/* El sello, solo si administración verificó al anunciante. SIN la palabra
          "Verificado": con dos tarjetas por fila el chip con texto ocupaba 143
          de los ~158 px de la tarjeta. La ficha del aviso sí lo escribe entero,
          que es donde se aprende el símbolo. */}
      {l.advertiserVerified && (
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

      {accionEsquina}

      <div className="relative overflow-hidden bg-muted" style={{ aspectRatio: "4 / 3" }}>
        <img
          src={imgUrl(l.imageUrl, anchoImagen)}
          srcSet={imgSrcSet(l.imageUrl, anchoImagen)}
          sizes={sizes}
          alt={l.title}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
        />
        {/* "Tiene video". Va DENTRO de la foto: colgado del marco exterior, su
            `bottom` aterrizaba sobre el precio. Solo el icono — la palabra
            "VIDEO" en mayúsculas sobre negro sólido pesaba más que el aviso. */}
        {(l.videoCount ?? 0) > 0 && (
          <span
            role="img"
            aria-label="Este aviso incluye video"
            className="absolute bottom-1.5 right-1.5 z-10 flex items-center justify-center w-6 h-6 bg-black/55 backdrop-blur-[2px] text-white/95"
          >
            <Video size={12} />
          </span>
        )}
      </div>

      {/* flex-1 + min-w-0: en WebKit los textos con line-clamp variaban de alto
          y descuadraban precios e insignias entre tarjetas vecinas. */}
      <div className="flex flex-col gap-1 sm:gap-1.5 p-2 sm:p-3 flex-1 min-w-0">
        {/* truncate: con dos por fila caben ~158 px, y categorías como
            "Vehículos y Repuestos" con este espaciado se salían. */}
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-secondary truncate">{l.category}</span>
        <h3 className="font-semibold text-foreground text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors min-h-[2.25rem]">
          {l.title}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 truncate"><MapPin size={11} />{ubicacionConPais(l.location, l.country)}</span>
        </div>
        {mostrarPrecio && (
          <p className="text-base font-extrabold text-primary tracking-tight">
            {formatPrecioAviso(l.price, l.currency)}
          </p>
        )}
        {pie}
      </div>
    </div>
  );
}

export default CuerpoDeAviso;
