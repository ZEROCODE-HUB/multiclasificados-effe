import { Badge } from "@/components/ui/badge";
import { imgUrl } from "@/lib/imageUrl";
import { Button } from "@/components/ui/button";
import { Eye, MapPin, Calendar, MoreVertical, Edit, Pause, Play, Trash2, Rocket, Clock, Flame, EyeOff } from "lucide-react";
import type { Listing } from "@/data/mockData";
import { expiryInfo } from "@/lib/listings";
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

export function ListingRow({ listing, status = "Activo", expiresAt, onView, onEdit, onDelete, onTogglePause, onPublish }: ListingRowProps) {
  const hasActions = !!(onView || onEdit || onDelete || onTogglePause || onPublish);
  // El contador solo tiene sentido en un aviso activo (los vencidos ya caducaron).
  const expiry = status === "Activo" ? expiryInfo(expiresAt ?? null) : null;
  return (
    <div className="group flex flex-col sm:flex-row gap-0 sm:gap-4 bg-card border border-border overflow-hidden hover:shadow-md hover:border-secondary/40 transition-all">
      {/* Image - prominent on mobile (full width), compact on desktop */}
      <div className="relative w-full sm:w-44 md:w-48 h-44 sm:h-32 flex-shrink-0 overflow-hidden bg-muted">
        <img
          src={imgUrl(listing.imageUrl, 200)}
          loading="lazy"
          decoding="async"
          alt={listing.title}
          loading="lazy"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 -mr-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0">
                <MoreVertical size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onPublish && (
                <DropdownMenuItem onSelect={() => onPublish(listing)}>
                  <Rocket size={14} className="mr-2" /> Publicar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onEdit?.(listing)}>
                <Edit size={14} className="mr-2" /> Editar
              </DropdownMenuItem>
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
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1"><MapPin size={11} /> {listing.location}</span>
          <span className="flex items-center gap-1"><Calendar size={11} /> {listing.date}</span>
          {expiry && (
            <span className={`flex items-center gap-1 ${expiryStyles[expiry.tone]}`}>
              <Clock size={11} /> {expiry.text}
            </span>
          )}
        </div>

        {/* Envuelve en móvil: con 3 acciones (4 en un borrador, por "Publicar") no
            caben junto al precio y el último botón se salía de la tarjeta. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mt-auto pt-2 border-t border-dashed">
          <p className="text-lg font-extrabold text-primary">
            <span className="text-xs font-bold text-secondary mr-1">{listing.currency}</span>
            {listing.price.toLocaleString()}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {hasActions ? (
              <>
                {/* Solo borradores: retoma el aviso guardado y lo publica. */}
                {onPublish && (
                  <Button size="sm" className="h-8 px-3 text-xs gap-1" onClick={() => onPublish(listing)}>
                    <Rocket size={13} /> Publicar
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1" onClick={() => onEdit?.(listing)}>
                  <Edit size={13} /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => onDelete?.(listing)}
                >
                  <Trash2 size={13} /> Eliminar
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
