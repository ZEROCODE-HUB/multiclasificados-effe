// Publicar un aviso que ya existe en la BD como borrador, desde "Mis avisos ›
// Borradores". No vuelve a crear el aviso ni a subir las imágenes: reutiliza el
// que el usuario guardó y solo cobra + activa.
//
// El control de identidad es EL MISMO que el del formulario de publicar
// (<VerifyIdentityDialog>), no una copia.
import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { VerifyIdentityDialog, type ConfirmedIdentity } from "@/components/VerifyIdentityDialog";
import { BuyCreditsModal } from "@/components/BuyCreditsModal";
import { finalizeListingPublication, renovarAviso, SaldoInsuficiente } from "@/lib/publish";
import { getCreditBalance } from "@/lib/credits";
import {
  priceForDuration, extrasTotal, formatSoles, formatCredits, solesToCredits, loadSettings,
  type DurationDays, type PricingSettings,
} from "@/lib/pricing";
import { fetchPricingSettings } from "@/lib/pricingRemote";
import { fetchActivePromotions, bestPromoForCategory, applyDiscount, type Promotion } from "@/lib/promotions";
import { contarAdjuntosDelAviso, type MyListing } from "@/lib/listings";
import { adicionalesQueFaltan, resumenDeFaltantes } from "@/lib/adicionalesCompletos";
import { faltaEnElAviso } from "@/lib/avisoCompleto";

const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];

// El plan guardado puede traer una duración que ya no está en la matriz de
// precios (o venir vacío en borradores anteriores a la migración 0041).
const asDuration = (d: number | null): DurationDays =>
  (DURATIONS as number[]).includes(d ?? 0) ? (d as DurationDays) : 7;

interface Props {
  draft: MyListing | null;
  email: string;
  fallbackName: string;
  onClose: () => void;
  onPublished: () => void;
  /**
   * "renovar" suma días a un aviso vivo conservando sus visitas, sus favoritos
   * y su enlace. "publicar" es el de siempre (borrador o vencido).
   */
  modo?: "publicar" | "renovar";
  /**
   * Llevar al usuario a completar el aviso cuando le falta un dato.
   *
   * Sin esto solo se le podría decir "falta la descripción" y dejarlo ahí, que
   * es exactamente el callejón sin salida que teníamos.
   */
  onEditar?: (draft: MyListing, campo: string) => void;
}

export function PublishDraftDialog({ draft, email, fallbackName, onClose, onPublished, modo = "publicar", onEditar }: Props) {
  const open = draft !== null;
  // EFFE-036: el mismo diálogo publica un borrador o REPUBLICA un aviso vencido.
  const isRepublish = draft?.status === "expired";
  // Y desde la 0113 también RENUEVA uno vivo: mismo precio, misma duración,
  // pero sumando días al aviso que ya existe en vez de crear vigencia nueva.
  const esRenovar = modo === "renovar";
  const [settings, setSettings] = useState<PricingSettings>(() => loadSettings());
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [duration, setDuration] = useState<DurationDays>(7);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [identity, setIdentity] = useState<ConfirmedIdentity | null>(null);

  // Al abrir con un borrador: precio vigente, promociones, saldo y el plan que
  // el usuario había elegido antes de guardar.
  // Lo que el aviso tiene subido de verdad. Se pide al abrir para poder avisar
  // ANTES de cobrar: un borrador puede llevar tres videos contratados y ninguno
  // subido, y publicarlo así son tres videos pagados por nada.
  const [adjuntos, setAdjuntos] = useState<{ imagenesExtra: number; tienePdf: boolean; videos: number } | null>(null);

  useEffect(() => {
    if (!draft) return;
    setDuration(asDuration(draft.planDurationDays));
    setIdentity(null);
    setAdjuntos(null);
    fetchPricingSettings().then(setSettings);
    fetchActivePromotions().then(setPromos);
    getCreditBalance().then(setBalance);
    contarAdjuntosDelAviso(draft.id).then(setAdjuntos).catch(() => setAdjuntos(null));
  }, [draft]);

  const extras = useMemo(() => draft?.planExtras ?? {}, [draft]);
  const quantity = draft?.planQuantity ?? 1;

  const baseSoles = useMemo(
    // Los adicionales van por día publicado: al cambiar la duración aquí, su
    // costo se mueve con ella.
    () => Math.round((priceForDuration(quantity, duration, settings) + extrasTotal(extras, duration, settings)) * 100) / 100,
    [quantity, duration, extras, settings],
  );
  const promo = draft ? bestPromoForCategory(promos, draft.category) : null;
  const totalSoles = promo ? applyDiscount(baseSoles, promo.discount_pct) : baseSoles;
  const totalCredits = solesToCredits(totalSoles);
  const enoughCredits = balance !== null && balance >= totalCredits;

  // Activa el borrador. `finalizeListingPublication` NO crea el aviso ni emite
  // comprobante: activa el aviso y descuenta el saldo, las dos cosas dentro de
  // la misma transacción de la base de datos (migración 0091).
  // `confirmed` es null al renovar: no se emite comprobante, así que no hay
  // identidad que confirmar. Antes se pasaba un objeto de mentira con el DNI
  // vacío, que además no cuadraba con el tipo.
  const publish = async (confirmed: ConfirmedIdentity | null) => {
    if (!draft || publishing) return;
    setPublishing(true);
    try {
      if (esRenovar) {
        await renovarAviso(draft.id, duration);
        setBalance(await getCreditBalance());
        toast({
          title: "¡Aviso renovado!",
          description: `Le sumamos ${duration} días. Conserva sus visitas, sus favoritos y su enlace.`,
        });
        onPublished();
        onClose();
        return;
      }
      // Publicar SÍ emite comprobante: sin identidad no se sigue. No debería
      // pasar (solo se llama con null al renovar), pero antes que publicar una
      // boleta a nombre de nadie, no publicar.
      if (!confirmed) return;
      const { published } = await finalizeListingPublication(draft.id, {
        quantity, duration, extras, total: totalSoles,
        receiptType: confirmed.docType === "ruc" ? "factura" : "boleta",
        email,
        advertiserName: confirmed.name || fallbackName,
        docType: confirmed.docType,
        docNumber: confirmed.docNumber,
      });
      setBalance(await getCreditBalance());

      if (!published) {
        toast({
          title: "El aviso no se activó",
          description: "Escribe a soporte con los datos del aviso. No se te ha cobrado nada.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: isRepublish ? "¡Aviso republicado!" : "¡Aviso publicado!",
        description: `Ya está activo por ${duration} días.`,
      });
      onPublished();
      onClose();
    } catch (err: unknown) {
      // Sin saldo la base de datos deshace la operación entera: el borrador
      // sigue intacto y no se ha cobrado nada.
      if (err instanceof SaldoInsuficiente) {
        setBalance(await getCreditBalance());
        toast({
          title: "Te falta saldo",
          description: err.faltan !== undefined
            ? `Te faltan ${formatCredits(err.faltan)}. Puedes pagarlos aquí mismo.`
            : esRenovar
              ? "Tu aviso sigue activo. Compra saldo y vuelve a intentarlo."
              : "Tu aviso sigue en borradores. Compra saldo y vuelve a intentarlo.",
          variant: "destructive",
        });
        setBuyOpen(true);
        return;
      }
      toast({
        title: esRenovar ? "No se pudo renovar" : "No se pudo publicar",
        description: err instanceof Error ? err.message : "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  // El usuario confirmó su documento: recién ahí se cobra y se publica.
  const onIdentityConfirmed = (confirmed: ConfirmedIdentity) => {
    setIdentity(confirmed);
    setVerifyOpen(false);
    publish(confirmed);
  };

  // Misma regla que al publicar desde el formulario: sin identidad confirmada
  // no se publica. Si ya la confirmó en este diálogo, no se le vuelve a pedir.
  const continuarPublicacion = () => {
    // Renovar no pide identidad: no emite comprobante ni crea nada nuevo, solo
    // le suma días a un aviso que ya es de quien está en sesión.
    if (esRenovar) { publish(null); return; }
    if (identity) { publish(identity); return; }
    setVerifyOpen(true);
  };

  const onPublishClick = () => {
    // Renovar no toca el contenido del aviso: ya está publicado y revisado.
    if (!esRenovar && draft) {
      // 1. ¿Está el aviso completo? Guardar un borrador solo exige título y
      //    categoría —así debe ser—, pero publicarlo exige lo mismo que el
      //    formulario, o saldría al público un aviso sin descripción.
      const falta = faltaEnElAviso(draft);
      if (falta) {
        toast({ title: "Al aviso le falta un dato", description: falta.mensaje, variant: "destructive" });
        onEditar?.(draft, falta.campo);
        onClose();
        return;
      }

      // 2. ¿Subió lo que contrató? Los adicionales se cobran por contratarlos.
      if (adjuntos) {
        const faltan = adicionalesQueFaltan(draft.planExtras, adjuntos);
        if (faltan.length > 0) {
          toast({
            title: "Te falta subir lo que contrataste",
            description: resumenDeFaltantes(faltan),
            variant: "destructive",
          });
          return;
        }
      }
    }

    if (!enoughCredits) { setBuyOpen(true); return; }
    continuarPublicacion();
  };

  return (
    <>
      <Dialog open={open && !verifyOpen && !buyOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{esRenovar ? "Renovar aviso" : isRepublish ? "Republicar aviso" : "Publicar borrador"}</DialogTitle>
            <DialogDescription>{draft?.title}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Duración</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v) as DurationDays)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>{d} días</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Costo</span>
                <span className="font-semibold">{formatSoles(totalSoles)}</span>
              </div>
              {promo && (
                <div className="flex justify-between text-xs text-success">
                  <span>{promo.name} (−{promo.discount_pct}%)</span>
                  <span className="line-through text-muted-foreground">{formatSoles(baseSoles)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Se descontarán</span>
                <span className="font-semibold">{formatCredits(totalCredits)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <span className="text-muted-foreground flex items-center gap-1.5"><Wallet size={13} /> Tu saldo</span>
                <span className={enoughCredits ? "font-semibold" : "font-semibold text-destructive"}>
                  {balance === null ? "…" : formatCredits(balance)}
                </span>
              </div>
            </div>

            {balance !== null && !enoughCredits && (
              <p className="text-xs text-muted-foreground">
                Te falta {formatCredits(totalCredits - balance)} de saldo. Al pulsar el botón abrirás la compra.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={onClose} disabled={publishing}>Cancelar</Button>
            <Button onClick={onPublishClick} disabled={publishing || balance === null} className="gap-2">
              {publishing
                ? <><Loader2 size={14} className="animate-spin" /> {isRepublish ? "Republicando…" : "Publicando…"}</>
                : enoughCredits
                  ? <><ShieldCheck size={14} /> {isRepublish ? "Republicar" : "Publicar"} por {formatCredits(totalCredits)}</>
                  : <>Comprar saldo</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VerifyIdentityDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        onConfirmed={onIdentityConfirmed}
      />

      {/* Sin saldo no se manda al usuario a "comprar créditos y volver": se le
          cobra aquí mismo lo que falta para ESTE aviso y el servidor lo publica
          al confirmarse el pago. */}
      <BuyCreditsModal
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        currentBalance={balance ?? 0}
        creditCost={totalCredits}
        publishFor={draft ? {
          listingId: draft.id,
          title: draft.title,
          costCredits: totalCredits,
          durationDays: duration,
          purpose: esRenovar ? "renew" : "publish",
        } : undefined}
        onPublished={async (publicado) => {
          setBuyOpen(false);
          setBalance(await getCreditBalance());
          if (publicado) {
            onPublished();
            onClose();
            return;
          }
          // Cobrado pero sin publicar (o ya le alcanzaba el saldo): se remata
          // por el camino de siempre, que pide la identidad si hace falta.
          continuarPublicacion();
        }}
        onPagoEnEspera={() => {
          // Pagó por Yape/Plin: no hay nada más que hacer aquí. Se cierra todo
          // —dejar abierto el diálogo de publicar invitaría a volver a pagar—
          // y se refresca la lista, que es donde va a ver su aviso marcado
          // "pago en revisión".
          setBuyOpen(false);
          onPublished();
          onClose();
          toast({
            title: "Tu aviso está en camino",
            description: esRenovar
              ? "En cuanto confirmemos tu pago, tu aviso se renueva solo."
              : "En cuanto confirmemos tu pago, tu aviso se publica solo. No tienes que hacer nada más.",
          });
        }}
        onPurchaseComplete={(newBalance) => {
          setBalance(newBalance);
          setBuyOpen(false);
        }}
      />
    </>
  );
}
