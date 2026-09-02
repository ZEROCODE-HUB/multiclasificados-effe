import { Badge } from "@/components/ui/badge";
import { imgUrl } from "@/lib/imageUrl";
import { Button } from "@/components/ui/button";
import { Eye, MapPin, Calendar, MoreVertical, Edit, Pause, Play, Trash2, Rocket, RotateCw, Copy, Clock, Flame, EyeOff, Ban } from "lucide-react";
import type { Listing } from "@/data/mockData";
import { duracionDelPlan, expiryInfo } from "@/lib/listings";
import { esAConvenir, formatPrecioAviso } from "@/lib/pricing";
import { fechaHoraCorta } from "@/lib/fechas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ListingRowProps {
  listing: Listing;
  status?: "Activo" | "Pausado" | "Vencido" | "Borrador";
  /** Fecha de vencimiento (ISO); alimenta el contador de días restantes. */
  expiresAt?: string | null;
  onView?: (listing: Listing) => void;
  onEdit?: (listing: Listing) => void;
  onDelete?: (listing: Listing) => void;
  onTogglePause?: (listing: Listing) => void;
  /** Solo en borradores: cobra y activa el aviso ya guardado. */
  onPublish?: (listing: Listing) => void;
  /** Solo en avisos vencidos: vuelve a cobrar y publicar (EFFE-036). */
  onRepublish?: (listing: Listing) => void;
  /** Aviso vivo por vencer: le suma días sin dejarlo caer (0113). */
  onRenew?: (listing: Listing) => void;
  /** Crea un aviso NUEVO con los mismos datos, para volver a anunciar lo mismo. */
  onDuplicate?: (listing: Listing) => void;
  /** Motivo de rechazo de moderación; si viene, se muestra un aviso. */
  rejectionReason?: string | null;
  /**
   * Este aviso ya está pagado por Yape/Plin y espera que lo confirmemos.
   *
   * Sin esta marca, un borrador pagado se ve igual que uno a medio escribir: el
   * usuario vuelve a pulsar "Publicar" y paga dos veces la misma cosa.
   */
  pagoEnEspera?: { metodo: string; confirmado: boolean } | null;
}

const statusStyles: Record<string, string> = {
  Activo: "bg-success text-success-foreground",
  Pausado: "bg-warning text-warning-foreground",
  Vencido: "bg-destructive text-destructive-foreground",
  // Un borrador no está "pausado": nunca llegó a publicarse.
  Borrador: "bg-muted text-muted-foreground border border-border",
};

// Color del contador de vencimiento según lo cerca que esté.
const expiryStyles: Record<string, string> = {
  normal: "text-muted-foreground",
  warning: "text-warning font-semibold",
  urgent: "text-destructive font-semibold",
};

export function ListingRow({ listing, status = "Activo", expiresAt, onView, onEdit, onDelete, onTogglePause, onPublish, onRepublish, onRenew, onDuplicate, rejectionReason, pagoEnEspera }: ListingRowProps) {
  const hasActions = !!(onView || onEdit || onDelete || onTogglePause || onPublish || onRepublish || onRenew || onDuplicate);
  // El menu ⋮ ya solo lleva las acciones secundarias. Sin ninguna de las tres
  // quedaba un boton que abria un desplegable vacio.
  const hasMenu = !!(onDuplicate || onTogglePause || onDelete);
  // El contador solo tiene sentido en un aviso activo (los vencidos ya caducaron).
  // La duración contratada decide CUÁNDO se advierte: sin ella, un plan de 3
  // días se pintaba en naranja desde el minuto uno.
  const expiry = status === "Activo"
    ? expiryInfo(
        expiresAt ?? null,
        duracionDelPlan(
          (listing as { planDurationDays?: number | null }).planDurationDays,
          listing.publishedAt ?? listing.date,
          expiresAt ?? null,
        ),
      )
    : null;
  return (
    <div className="group flex flex-col sm:flex-row gap-0 sm:gap-4 bg-card border border-border overflow-hidden hover:shadow-md hover:border-secondary/40 transition-all">
      {/* Image - prominent on mobile (full width), compact on desktop */}
      <div className="relative w-full sm:w-44 md:w-48 h-44 sm:h-32 flex-shrink-0 overflow-hidden bg-muted">
        <img
          src={imgUrl(listing.imageUrl, 200)}
          loading="lazy"
          decoding="async"
          alt={listing.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <Badge className={`absolute top-2 left-2 ${statusStyles[status]} shadow-md`}>{status}</Badge>
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {listing.featured && (
            <Badge className="bg-secondary text-secondary-foreground shadow-md">Destacado</Badge>
          )}
          {listing.urgent && (
            <Badge className="bg-destructive text-destructive-foreground shadow-md gap-1"><Flame size={10} /> Urgente</Badge>
          )}
          {listing.confidential && (
            <Badge className="bg-primary text-primary-foreground shadow-md gap-1"><EyeOff size={10} /> Confidencial</Badge>
          )}
        </div>
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-semibold backdrop-blur-sm">
          <Eye size={11} /> {listing.views}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-3 sm:p-4 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-semibold text-foreground line-clamp-2 leading-snug">{listing.title}</h3>
          {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* `aria-label`: es un icono suelto, así que sin esto un lector
                  de pantalla lo anuncia como "botón" a secas — y ahora que
                  guarda acciones que no están en ningún otro sitio (pausar,
                  eliminar, publicar uno igual), quedarse sin poder abrirlo es
                  quedarse sin ellas. */}
              <button
                type="button"
                aria-label="Más opciones del aviso"
                title="Más opciones"
                className="p-1 -mr-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            {/* EL MENÚ SOLO LLEVA LO QUE NO ESTÁ ABAJO.
                Publicar, Republicar, Renovar, Editar y Eliminar estaban aquí Y
                como botón en el pie de la fila: cinco acciones por duplicado, y
                las tres primeras además con el mismo icono. Aquí se quedan las
                secundarias —las que no son "lo siguiente que hay que hacer" con
                este aviso— y el pie se queda con las principales. */}
            <DropdownMenuContent align="end">
              {onDuplicate && (
                <DropdownMenuItem onSelect={() => onDuplicate(listing)}>
                  <Copy size={14} className="mr-2" /> Publicar uno igual
                </DropdownMenuItem>
              )}
              {onTogglePause && (
                <DropdownMenuItem onSelect={() => onTogglePause(listing)}>
                  {status === "Pausado" ? (
                    <><Play size={14} className="mr-2" /> Reactivar</>
                  ) : (
                    <><Pause size={14} className="mr-2" /> Pausar</>
                  )}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => onDelete(listing)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 size={14} className="mr-2" /> Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1"><MapPin size={11} /> {listing.location}</span>
          {/* Con la hora: es donde el anunciante comprueba cuándo entró su
              aviso, y "2026-08-28" a secas no le dice si fue antes o después
              de pagar. */}
          <span className="flex items-center gap-1"><Calendar size={11} /> {fechaHoraCorta(listing.publishedAt ?? listing.date)}</span>
          {expiry && (
            <span className={`flex items-center gap-1 ${expiryStyles[expiry.tone]}`}>
              <Clock size={11} /> {expiry.text}
            </span>
          )}
        </div>

        {/* Motivo de rechazo de moderación: antes un aviso rechazado se veía igual
            que uno vencido o vendido. */}
        {rejectionReason && (
          <div className="mb-3 flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            <Ban size={12} className="mt-0.5 shrink-0" />
            <span><span className="font-semibold">Rechazado:</span> {rejectionReason}</span>
          </div>
        )}

        {pagoEnEspera && (
          <div className="mb-3 flex items-start gap-1.5 rounded-md border border-secondary/40 bg-secondary/10 px-2 py-1.5 text-xs">
            <Clock size={12} className="mt-0.5 shrink-0 text-secondary" />
            <span>
              <span className="font-semibold">Pago por {pagoEnEspera.metodo} en revisión.</span>{" "}
              {pagoEnEspera.confirmado
                ? "En cuanto lo confirmemos, tu aviso se publica solo."
                : "Mándanos el voucher por WhatsApp para que podamos confirmarlo."}
            </span>
          </div>
        )}

        {/* Envuelve en móvil: con 3 acciones (4 en un borrador, por "Publicar") no
            caben junto al precio y el último botón se salía de la tarjeta. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-auto pt-2 border-t border-dashed">
          {/* Mismo criterio que en las tarjetas del buscador: "Precio a
              convenir" no es un importe y no se pinta como uno. */}
          <p
            className={
              esAConvenir(listing.price)
                ? "text-sm font-semibold text-muted-foreground"
                : "text-lg font-extrabold text-primary"
            }
          >
            {formatPrecioAviso(listing.price, listing.currency)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {hasActions ? (
              <>
                {/* LAS TRES SON DISTINTAS Y SE PARECÍAN DEMASIADO: mismo icono,
                    misma forma y ninguna explicación. El `title` dice qué hace
                    cada una, que es lo que preguntaba el cliente. Solo puede
                    salir UNA: dependen del estado del aviso, que es excluyente. */}
                {/* Solo borradores: retoma el aviso guardado y lo publica. */}
                {onPublish && (
                  <Button
                    size="sm" className="h-8 px-3 text-xs gap-1"
                    title="Cobra el plan y saca el aviso a la calle."
                    onClick={() => onPublish(listing)}
                  >
                    <Rocket size={13} /> Publicar
                  </Button>
                )}
                {/* Solo vencidos: vuelve a cobrar y publicar (EFFE-036). */}
                {onRepublish && (
                  <Button
                    size="sm" className="h-8 px-3 text-xs gap-1"
                    title="Tu aviso ya venció. Vuelve a ponerlo en circulación con el mismo enlace y sus visitas."
                    onClick={() => onRepublish(listing)}
                  >
                    <RotateCw size={13} /> Republicar
                  </Button>
                )}
                {/* Por vencer: se le suman días y conserva visitas y enlace. */}
                {onRenew && (
                  <Button
                    size="sm" className="h-8 px-3 text-xs gap-1"
                    title="Le suma días antes de que venza, sin que deje de verse. Conserva sus visitas, sus favoritos y su enlace."
                    onClick={() => onRenew(listing)}
                  >
                    <RotateCw size={13} /> Renovar
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1" onClick={() => onEdit?.(listing)}>
                  <Edit size={13} /> Editar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-3 text-xs bg-primary hover:bg-primary/90"
                  onClick={() => onView?.(listing)}
                >
                  Ver
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs">Editar</Button>
                <Button variant="default" size="sm" className="h-8 px-3 text-xs bg-primary hover:bg-primary/90">
                  Ver
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
