import { useEffect, useState } from "react";
import { imgUrl } from "@/lib/imageUrl";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchAdminListing, type AdminListingDetail } from "@/lib/admin";

/**
 * El aviso denunciado, para que el moderador lo inspeccione sin salir de donde
 * está (ni la denuncia ni la lista de reportados).
 *
 * Lee con `admin_get_listing` (migración 0044) y no con la vista pública
 * `listing_cards`: esa filtra `status = 'active'`, y un aviso denunciado suele
 * estar deshabilitado precisamente por eso, así que no se vería.
 */

// Estado del aviso (tabla listings) → etiqueta legible.
const listingStatusLabel: Record<string, string> = {
  active: "Activo", paused: "Pausado", pending: "Pendiente",
  rejected: "Rechazado", draft: "Borrador", expired: "Expirado",
};

const money = (price: number, currency: string) =>
  `${currency === "USD" ? "$" : "S/"} ${Number(price ?? 0).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

interface Props {
  /** Aviso a mostrar. `null` mantiene el diálogo cerrado. */
  listingId: string | null;
  /** Motivo de la denuncia, como contexto en la cabecera. */
  reason?: string | null;
  /** Título conocido, para no dejar la cabecera vacía mientras carga. */
  fallbackTitle?: string | null;
  onClose: () => void;
}

export function ListingPreviewDialog({ listingId, reason, fallbackTitle, onClose }: Props) {
  const [aviso, setAviso] = useState<AdminListingDetail | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");

  useEffect(() => {
    if (!listingId) return;
    let vigente = true;
    setAviso(null);
    setEstado("cargando");
    fetchAdminListing(listingId)
      .then((l) => {
        if (!vigente) return;
        setAviso(l);
        setEstado(l ? "listo" : "error");
      })
      .catch(() => vigente && setEstado("error"));
    return () => { vigente = false; };
  }, [listingId]);

  return (
    <Dialog open={!!listingId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base pr-6">{aviso?.title ?? fallbackTitle ?? "Aviso denunciado"}</DialogTitle>
          <DialogDescription className="text-xs">
            {reason ? `Aviso denunciado por: ${reason}` : "Contenido del aviso reportado"}
          </DialogDescription>
        </DialogHeader>

        {estado === "cargando" && (
          <p className="text-sm text-muted-foreground py-8 text-center">Cargando el aviso…</p>
        )}
        {estado === "error" && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No se pudo cargar el aviso. Puede haber sido eliminado.
          </p>
        )}

        {estado === "listo" && aviso && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{listingStatusLabel[aviso.status] ?? aviso.status}</Badge>
              {aviso.featured && <Badge variant="outline">Destacado</Badge>}
              {aviso.urgent && <Badge variant="outline">Urgente</Badge>}
              <span className="text-lg font-bold text-secondary ml-auto">{money(aviso.price, aviso.currency)}</span>
            </div>

            {aviso.images.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {aviso.images.map((url) => (
                  <img key={url} src={imgUrl(url, 300)} alt="" loading="lazy" decoding="async" className="w-full h-28 object-cover rounded-lg border" />
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <p><span className="text-muted-foreground">Anunciante:</span> {aviso.advertiser ?? "—"}</p>
              <p><span className="text-muted-foreground">Vistas:</span> {aviso.views}</p>
              {aviso.category_id && <p><span className="text-muted-foreground">Categoría:</span> {aviso.category_id}</p>}
              {aviso.location && <p><span className="text-muted-foreground">Ubicación:</span> {aviso.location}</p>}
              {aviso.condition && <p><span className="text-muted-foreground">Estado:</span> {aviso.condition}</p>}
              <p><span className="text-muted-foreground">Publicado:</span> {(aviso.published_at ?? aviso.created_at).slice(0, 10)}</p>
            </div>

            {aviso.description && (
              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Descripción</p>
                <p className="text-sm whitespace-pre-wrap break-words">{aviso.description}</p>
              </div>
            )}

            {aviso.rejection_reason && (
              <p className="text-sm text-destructive">
                <span className="text-muted-foreground">Motivo del rechazo:</span> {aviso.rejection_reason}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
