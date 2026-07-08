import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, ShieldCheck, User, Building2, Check, CheckCircle2, AlertCircle, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { purchaseCredits, type CreditPackage, type PurchaseInvoiceData } from "@/lib/credits";
import {
  loadSettings, priceForDuration, extrasTotal, formatSoles, solesToCredits,
  type DurationDays, type ExtrasSelection, type PricingSettings, type ExtraPrices,
} from "@/lib/pricing";
import { fetchPricingSettings } from "@/lib/pricingRemote";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { verifyDocument } from "@/lib/verifyDoc";

// Correo válido para el comprobante.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  open: boolean;
  onClose: () => void;
  creditCost: number;      // costo del aviso que se quiere publicar
  currentBalance: number;  // saldo actual del usuario
  onPurchaseComplete: (newBalance: number) => void;
}

const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];

// Solo los adicionales con costo (>0 en la matriz por defecto).
const EXTRA_DEFS: Array<{ key: keyof ExtraPrices; label: string; sub: string }> = [
  { key: "img500", label: "2ª imagen", sub: "mayor a 100 KB" },
  { key: "pdf500", label: "Adjuntar PDF", sub: "hasta 500 KB" },
  { key: "urgente", label: "Etiqueta Urgente", sub: "resalta el aviso" },
  { key: "destacado", label: "Aviso Destacado", sub: "aparece arriba" },
];

export function BuyCreditsModal({ open, onClose, creditCost, currentBalance, onPurchaseComplete }: Props) {
  const [settings, setSettings] = useState<PricingSettings>(() => loadSettings());
  const [buying, setBuying] = useState(false);

  // Configurador de la compra
  const [quantity, setQuantity] = useState(1);
  const [duration, setDuration] = useState<DurationDays>(7);
  const [extras, setExtras] = useState<ExtrasSelection>({});

  // Datos de comprobante
  const [personType, setPersonType] = useState<"natural" | "juridica">("natural");
  const [docNumber, setDocNumber] = useState("");
  const [email, setEmail] = useState("");
  const [receiptType, setReceiptType] = useState<"boleta" | "factura">("boleta");

  // Verificación del documento con Factiliza (nombre/razón social + datos).
  const [verifiedName, setVerifiedName] = useState("");
  const [docData, setDocData] = useState<Record<string, unknown> | null>(null);
  const [verifyingDoc, setVerifyingDoc] = useState(false);
  const [docError, setDocError] = useState("");

  const deficit = Math.max(0, creditCost - currentBalance);

  // En el APK, reserva el alto del teclado y centra el campo enfocado.
  const { kbPad, scrollFocusedIntoView } = useKeyboardInset();

  // Al completar el documento (DNI 8 / RUC 11) lo consultamos automáticamente en
  // Factiliza y mostramos el nombre/razón social y los datos disponibles.
  useEffect(() => {
    const docType = personType === "natural" ? "dni" : "ruc";
    const requiredLen = personType === "natural" ? 8 : 11;
    setDocError("");
    if (docNumber.length !== requiredLen) {
      setVerifiedName("");
      setDocData(null);
      setVerifyingDoc(false);
      return;
    }
    let cancelled = false;
    setVerifyingDoc(true);
    setVerifiedName("");
    setDocData(null);
    verifyDocument(docType, docNumber)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setVerifiedName(r.nombre ?? "");
          setDocData(r.data ?? null);
        } else {
          setDocError(r.error ?? "No se pudo verificar el documento.");
        }
      })
      .catch(() => { if (!cancelled) setDocError("No se pudo verificar el documento."); })
      .finally(() => { if (!cancelled) setVerifyingDoc(false); });
    return () => { cancelled = true; };
  }, [docNumber, personType]);

  const emailValid = EMAIL_RE.test(email.trim());
  // Campo de Factiliza; "" si no viene o viene vacío (varios llegan en blanco).
  const docField = (k: string): string => {
    const v = docData?.[k];
    return typeof v === "string" && v.trim() ? v.trim() : "";
  };

  // Ficha a mostrar tras verificar. Factiliza devuelve `direccion_completa` con
  // el ubigeo ya concatenado; si falta, la armamos con dirección + ubigeo.
  const ubigeo = [docField("distrito"), docField("provincia"), docField("departamento")]
    .filter(Boolean).join(" - ");
  const direccion = docField("direccion_completa")
    || [docField("direccion"), ubigeo].filter(Boolean).join(", ");

  const docRows: Array<[string, string]> = personType === "natural"
    ? [
        ["DNI", docNumber],
        ["Domicilio", direccion],
      ]
    : [
        ["RUC", docNumber],
        ["Estado", docField("estado")],
        ["Condición", docField("condicion")],
        ["Tipo", docField("tipo_contribuyente")],
        ["Domicilio fiscal", direccion],
      ];

  // Al abrir: recarga la matriz de precios vigente desde la base de datos.
  useEffect(() => {
    if (open) fetchPricingSettings().then(setSettings);
  }, [open]);

  const packageBase = useMemo(
    () => priceForDuration(quantity, duration, settings),
    [quantity, duration, settings],
  );
  const extrasSum = useMemo(() => extrasTotal(extras, settings), [extras, settings]);
  // Precio en soles (dinero real, para la boleta).
  const solesTotal = Math.round((packageBase + extrasSum) * 100) / 100;
  // Créditos a comprar (enteros): soles × multiplicador.
  const creditsToBuy = solesToCredits(solesTotal);

  const handleBuy = async () => {
    if (creditsToBuy <= 0) { toast({ title: "Selecciona qué comprar", variant: "destructive" }); return; }
    if (!verifiedName) {
      toast({
        title: personType === "natural" ? "Verifica tu DNI" : "Verifica tu RUC",
        description: "Ingresa un documento válido para continuar (se valida automáticamente).",
        variant: "destructive",
      });
      return;
    }
    if (!emailValid) { toast({ title: "Ingresa un correo válido", variant: "destructive" }); return; }
    setBuying(true);
    try {
      const detailExtras = EXTRA_DEFS.filter((d) => extras[d.key]).map((d) => d.label);
      const pkg: CreditPackage = {
        id: "custom",
        name: `${quantity} aviso${quantity > 1 ? "s" : ""} · ${duration} días${detailExtras.length ? ` · ${detailExtras.join(", ")}` : ""}`,
        credits_amount: creditsToBuy,
        price_soles: solesTotal,
        sort_order: 0,
        is_active: true,
      };
      const invoiceData: PurchaseInvoiceData = {
        receiptType,
        email: email.trim(),
        advertiserName: verifiedName,
        docType: personType === "natural" ? "dni" : "ruc",
        docNumber: docNumber.trim(),
      };
      const { newBalance, invoiceNumber } = await purchaseCredits(pkg, invoiceData);
      toast({
        title: "¡Créditos acreditados!",
        description: `${creditsToBuy} créditos añadidos. Comprobante: ${invoiceNumber}`,
      });
      onPurchaseComplete(newBalance);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al procesar la compra.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBuying(false);
    }
  };

  const balanceAfter = currentBalance + creditsToBuy;
  const coversAd = balanceAfter >= creditCost;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        style={kbPad ? { paddingBottom: kbPad + 24 } : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet size={18} className="text-secondary" /> Comprar créditos
          </DialogTitle>
          <DialogDescription>
            Arma tu compra: elige cantidad de avisos, duración y adicionales. Todo suma créditos que podrás usar al publicar.
          </DialogDescription>
        </DialogHeader>

        {/* Aviso: cuántos créditos necesita para publicar */}
        {creditCost > 0 && (
          <div className="text-xs border p-3 bg-muted/30 flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              Para publicar tu aviso necesitas <b className="text-foreground">{creditCost} cr</b>
              {deficit > 0 && <> · tu saldo: {currentBalance} cr</>}
            </span>
            {deficit > 0 && <span className="font-bold text-destructive whitespace-nowrap">Faltan {deficit}</span>}
          </div>
        )}

        {/* Cantidad de avisos */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Cantidad de avisos</Label>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="icon" className="h-9 w-9"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>
              <Minus size={16} />
            </Button>
            <span className="text-2xl font-extrabold w-10 text-center">{quantity}</span>
            <Button type="button" variant="outline" size="icon" className="h-9 w-9"
              onClick={() => setQuantity((q) => Math.min(10, q + 1))} disabled={quantity >= 10}>
              <Plus size={16} />
            </Button>
            <span className="text-xs text-muted-foreground ml-1">Hasta 10 (a más avisos, menor precio por aviso).</span>
          </div>
        </div>

        {/* Duración */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Duración (días)</Label>
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map((d) => {
              const isSel = duration === d;
              const p = priceForDuration(quantity, d, settings);
              return (
                <button key={d} type="button" onClick={() => setDuration(d)}
                  className={`p-2 border text-center transition-all ${isSel ? "border-secondary bg-secondary/10 ring-2 ring-secondary/30" : "border-border hover:bg-muted/50"}`}>
                  <p className="font-bold text-sm">{d} días</p>
                  <p className="text-[11px] text-muted-foreground">{solesToCredits(p)} cr</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Adicionales */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Características extra</Label>
          <div className="grid grid-cols-2 gap-2">
            {EXTRA_DEFS.map((d) => {
              const unit = settings.extras[d.key] ?? 0;
              const isSel = !!extras[d.key];
              return (
                <button key={d.key} type="button"
                  onClick={() => setExtras((prev) => ({ ...prev, [d.key]: !prev[d.key] }))}
                  className={`relative p-3 border text-left transition-all ${isSel ? "border-secondary bg-secondary/10 ring-2 ring-secondary/30" : "border-border hover:bg-muted/50"}`}>
                  <p className="font-bold text-xs">{d.label}</p>
                  <p className="text-[10px] text-muted-foreground">{d.sub}</p>
                  <p className="text-xs font-semibold text-secondary mt-1">+{solesToCredits(unit)} cr</p>
                  {isSel && <Check size={14} className="absolute top-2 right-2 text-secondary" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Total a comprar */}
        <div className="border p-3 bg-secondary/5 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{quantity} aviso{quantity > 1 ? "s" : ""} × {duration} días</span>
            <span className="font-semibold">{solesToCredits(packageBase)} cr</span>
          </div>
          {extrasSum > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Adicionales</span>
              <span className="font-semibold">{solesToCredits(extrasSum)} cr</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between items-baseline">
            <span className="font-bold uppercase tracking-wider text-xs">Créditos a comprar</span>
            <span className="text-2xl font-extrabold text-secondary">{creditsToBuy} cr</span>
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Pagas (boleta)</span>
            <span className="font-semibold">{formatSoles(solesTotal)}</span>
          </div>
          {creditCost > 0 && (
            <p className={`text-[11px] ${coversAd ? "text-success" : "text-destructive"}`}>
              {coversAd
                ? "✓ Con esta compra podrás publicar tu aviso."
                : `Aún faltarían ${creditCost - balanceAfter} cr para publicar tu aviso.`}
            </p>
          )}
        </div>

        {/* Datos de comprobante */}
        <div className="space-y-3 border-t pt-3">
          <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Datos del comprobante</Label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => { setPersonType("natural"); setReceiptType("boleta"); setDocNumber(""); }}
              className={`p-3 border text-left transition-all ${personType === "natural" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}>
              <User size={16} className="text-secondary mb-1" />
              <p className="font-bold text-xs">Persona natural</p>
              <p className="text-[10px] text-muted-foreground">Boleta · DNI</p>
            </button>
            <button type="button"
              onClick={() => { setPersonType("juridica"); setReceiptType("factura"); setDocNumber(""); }}
              className={`p-3 border text-left transition-all ${personType === "juridica" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}>
              <Building2 size={16} className="text-secondary mb-1" />
              <p className="font-bold text-xs">Empresa</p>
              <p className="text-[10px] text-muted-foreground">Factura · RUC</p>
            </button>
          </div>
          <div>
            <Label className="text-xs">
              {personType === "natural" ? "DNI (8 dígitos)" : "RUC (11 dígitos)"} <span className="text-destructive">*</span>
            </Label>
            <Input value={docNumber} onFocus={scrollFocusedIntoView}
              onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ""))}
              maxLength={personType === "natural" ? 8 : 11}
              inputMode="numeric"
              placeholder={personType === "natural" ? "12345678" : "20123456789"} className="mt-1" />

            {/* Resultado de la verificación con Factiliza */}
            {verifyingDoc && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 size={13} className="animate-spin" /> Verificando en Factiliza…
              </p>
            )}
            {!verifyingDoc && verifiedName && (
              <div className="mt-2 rounded-md border border-success/40 bg-success/5 p-2.5 text-xs space-y-1.5">
                <p className="flex items-center gap-1.5 font-semibold text-success">
                  <CheckCircle2 size={14} /> {personType === "natural" ? "Identidad verificada" : "Empresa verificada"}
                </p>
                <p className="font-medium text-foreground leading-snug">{verifiedName}</p>
                {/* Ficha de Factiliza. Omitimos las filas que llegan vacías. */}
                <dl className="space-y-0.5">
                  {docRows.filter(([, v]) => v).map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                      <dd className="text-foreground break-words">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {!verifyingDoc && docError && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                <AlertCircle size={13} className="mt-0.5 shrink-0" /> {docError}
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">Correo para el comprobante <span className="text-destructive">*</span></Label>
            <Input type="email" value={email} onFocus={scrollFocusedIntoView}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              placeholder="tu@correo.com" className="mt-1" />
            {email.length > 0 && !emailValid && (
              <p className="mt-1 text-xs text-destructive">Ingresa un correo válido.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={buying}>Cancelar</Button>
          <Button onClick={handleBuy} disabled={buying || creditsToBuy <= 0 || verifyingDoc || !verifiedName || !emailValid} className="gap-2">
            {buying
              ? <><Loader2 size={14} className="animate-spin" /> Procesando…</>
              : <><ShieldCheck size={14} /> Comprar {creditsToBuy} cr — {formatSoles(solesTotal)}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
