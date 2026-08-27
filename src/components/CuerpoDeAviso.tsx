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
  l, anchoImagen, sizes, urgente, mostrarPrecio = true, cobertura, accionEsquina, pie,
  className = "",
}: Props) {
  // "Destacado" no lleva chip: el marco dorado ya lo dice, y el icono era la
  // misma información dos veces justo donde menos sitio hay.
  const chips = listingBadges(l).filter((b) => b.key !== "featured");
  const featured = !!l.featured;

  // Los chips, una sola vez: cambian de SITIO segun la forma, no de contenido.
  const bloqueDeChips = chips.length > 0 && (
    <TooltipProvider delayDuration={100}>
      {chips.map(({ key, label, icon: Icon, cls, bg }) => {
        const cuenta = key === "urgent" && urgente && !urgente.expired;
        return (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <span
                // role="img": el chip es un icono cuyo significado lo da el
                // aria-label; un span con aria-label y sin rol válido dispara
                // el fallo de accesibilidad de Lighthouse.
                role="img"
                aria-label={cuenta ? `${label} · quedan ${urgente!.short}` : label}
                onClick={(e) => e.stopPropagation()}
                className={`relative overflow-hidden h-7 shrink-0 flex items-center justify-center gap-1 shadow-md ${cuenta ? "px-1.5 w-auto" : "w-7"} ${cls}`}
              >
                {/* EL QUE PARPADEA ES EL FONDO, NO EL CHIP.
                    Animando la opacidad del chip entero, el icono y el contador
                    de horas se desvanecían con él y la cifra dejaba de leerse
                    justo cuando más se mira.
                    Y es un DESTELLO por encima de un rojo que sigue sólido, no
                    el rojo volviéndose transparente: así detrás no se asoma la
                    foto, que dejaba el chip sucio sobre imágenes claras. */}
                {cuenta && (
                  <span aria-hidden className="absolute inset-0 bg-white motion-safe:animate-latido-urgente" />
                )}
                <Icon size={14} className="relative z-10" />
                {cuenta && (
                  <span className={`relative z-10 text-[11px] font-bold leading-none tabular-nums`}>
                    {urgente!.short}
                  </span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent>{cuenta ? `Urgente · quedan ${urgente!.long}` : label}</TooltipContent>
          </Tooltip>
        );
      })}
    </TooltipProvider>
  );

  return (
    <div className={`group relative flex flex-col overflow-hidden ${marcoDeAviso(featured)} ${className}`}>
      {/* El color no es información para todo el mundo. */}
      {featured && <span className="sr-only">Aviso destacado</span>}

      {cobertura}

      {/* EN VERTICAL los distintivos van sobre la foto, arriba a la izquierda:
          es donde hay hueco y donde el ojo los busca. El max-w reserva el sitio
          del favorito (de 12 a 44 px); sin él, con tres distintivos el bloque
          crecía hasta encimarse con él.
          */}
      {bloqueDeChips && (
        <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5 w-fit max-w-[calc(100%-3.5rem)]">
          {bloqueDeChips}
        </div>
      )}

      {/* El sello NO va sobre la foto: bajó al bloque de texto. Ahí arriba era
          un recuadro de 32 px tapando parte del aviso, y competía con el
          favorito y con los distintivos por las mismas esquinas. */}

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
            className={`absolute bottom-1.5 right-1.5 z-10 flex items-center justify-center bg-black/55 backdrop-blur-[2px] text-white/95 w-6 h-6`}
          >
            <Video size={12} />
          </span>
        )}
      </div>

      {/* flex-1 + min-w-0: en WebKit los textos con line-clamp variaban de alto
          y descuadraban precios e insignias entre tarjetas vecinas. */}
      <div className="flex flex-col min-w-0 flex-1 gap-1 sm:gap-1.5 p-2 sm:p-3">
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

        {/* El sello, ya en texto y fuera de la foto.
            Dice "ANUNCIANTE verificado" y no solo "Verificado" a propósito: aquí
            va pegado al precio, y a secas se leería como si lo comprobado fuera
            el importe o el aviso. Lo que el equipo revisa es a la persona o la
            empresa que publica, que es otra cosa. */}
        {l.advertiserVerified && (
          <p className="flex items-center gap-1 text-[10px] font-semibold text-secondary">
            <ShieldCheck size={11} className="shrink-0" />
            <span className="truncate">Anunciante verificado</span>
          </p>
        )}

        {pie}
      </div>
    </div>
  );
}

export default CuerpoDeAviso;
