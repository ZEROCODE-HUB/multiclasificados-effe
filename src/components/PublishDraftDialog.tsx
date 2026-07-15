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
import { finalizeListingPublication } from "@/lib/publish";
import { getCreditBalance, spendCredits } from "@/lib/credits";
import {
  priceForDuration, extrasTotal, formatSoles, formatCredits, solesToCredits, loadSettings,
  type DurationDays, type PricingSettings,
} from "@/lib/pricing";
import { fetchPricingSettings } from "@/lib/pricingRemote";
import { fetchActivePromotions, bestPromoForCategory, applyDiscount, type Promotion } from "@/lib/promotions";
import type { MyListing } from "@/lib/listings";

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
}

export function PublishDraftDialog({ draft, email, fallbackName, onClose, onPublished }: Props) {
  const open = draft !== null;
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
  useEffect(() => {
    if (!draft) return;
    setDuration(asDuration(draft.planDurationDays));
    setIdentity(null);
    fetchPricingSettings().then(setSettings);
    fetchActivePromotions().then(setPromos);
    getCreditBalance().then(setBalance);
  }, [draft]);

  const extras = useMemo(() => draft?.planExtras ?? {}, [draft]);
  const quantity = draft?.planQuantity ?? 1;

  const baseSoles = useMemo(
    () => Math.round((priceForDuration(quantity, duration, settings) + extrasTotal(extras, settings)) * 100) / 100,
    [quantity, duration, extras, settings],
  );
  const promo = draft ? bestPromoForCategory(promos, draft.category) : null;
  const totalSoles = promo ? applyDiscount(baseSoles, promo.discount_pct) : baseSoles;
  const totalCredits = solesToCredits(totalSoles);
  const enoughCredits = balance !== null && balance >= totalCredits;

  // Cobra y activa el borrador. `finalizeListingPublication` NO crea el aviso ni
  // emite comprobante: solo descuenta saldo (spendCredits) y activa el aviso.
  const publish = async (confirmed: ConfirmedIdentity) => {
    if (!draft || publishing) return;
    setPublishing(true);
    try {
      const spent = await spendCredits(totalCredits, draft.id);
      const newBalance = await getCreditBalance();
      setBalance(newBalance);
      if (!spent) {
        toast({
          title: "No se pudo descontar el saldo",
          description: "Tu saldo cambió y ya no alcanza. Compra saldo para completar.",
          variant: "destructive",
        });
        setBuyOpen(true);
        return;
      }

      const { published } = await finalizeListingPublication(draft.id, {
        quantity, duration, extras, total: totalSoles,
        receiptType: confirmed.docType === "ruc" ? "factura" : "boleta",
        email,
        advertiserName: confirmed.name || fallbackName,
        docType: confirmed.docType,
        docNumber: confirmed.docNumber,
      });

      if (!published) {
        // El saldo ya se descontó: no lo escondemos detrás de un "publicado" falso.
        toast({
          title: "Se descontó el saldo pero el aviso no se activó",
          description: "Escribe a soporte con los datos del aviso. No vuelvas a publicarlo.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "¡Aviso publicado!",
        description: `Ya está activo por ${duration} días.`,
      });
      onPublished();
      onClose();
    } catch (err: unknown) {
      toast({
        title: "No se pudo publicar",
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

  const onPublishClick = () => {
    if (!enoughCredits) { setBuyOpen(true); return; }
    // Misma regla que al publicar desde el formulario: sin identidad confirmada
    // no se publica. Si ya la confirmó en este diálogo, no se le vuelve a pedir.
    if (identity) { publish(identity); return; }
    setVerifyOpen(true);
  };

  return (
    <>
      <Dialog open={open && !verifyOpen && !buyOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publicar borrador</DialogTitle>
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
                ? <><Loader2 size={14} className="animate-spin" /> Publicando…</>
                : enoughCredits
                  ? <><ShieldCheck size={14} /> Publicar por {formatCredits(totalCredits)}</>
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

      <BuyCreditsModal
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        currentBalance={balance ?? 0}
        creditCost={totalCredits}
        onPurchaseComplete={(newBalance) => {
          setBalance(newBalance);
          setBuyOpen(false);
        }}
      />
    </>
  );
}
