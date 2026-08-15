import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, User, Building2, Check, CheckCircle2, AlertCircle, Loader2, Minus, Plus, CreditCard, ArrowLeft, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  loadSettings, priceForDuration, extrasTotal, formatSoles, formatCredits, solesToCredits,
  type DurationDays, type ExtrasSelection, type PricingSettings, type ExtraPrices,
} from "@/lib/pricing";
import { fetchPricingSettings } from "@/lib/pricingRemote";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { verifyDocument, normalizeDocNumber } from "@/lib/verifyDoc";
import {
  createPayment, createPublishPayment, pollOrderStatus, getPurchaseResult, hostedPaymentUrl,
  SaldoYaSuficiente,
  type PurchaseConfig, type CreatePaymentResult, type OrderOutcome,
} from "@/lib/payments";
import { PaymentForm } from "@/components/PaymentForm";

// Correo válido para el comprobante.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Piso de cobro de la pasarela. Debe coincidir con MIN_CHARGE_PEN de la Edge
// Function create-payment: si aquí se enseña un importe y allí se cobra otro,
// el usuario ve una cifra en el resumen y otra en el formulario de la tarjeta.
const MIN_COBRO = 1;

// Aviso que se quiere publicar pagando en el acto lo que falta.
export interface PublishTarget {
  listingId: string;
  title: string;
  costCredits: number;
  durationDays: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  creditCost: number;      // costo del aviso que se quiere publicar
  currentBalance: number;  // saldo actual del usuario
  onPurchaseComplete: (newBalance: number) => void;
  // Con esto el modal deja de ser un configurador de saldo y pasa a cobrar SOLO
  // lo que falta para publicar ESE aviso, que el servidor publica al confirmarse
  // el pago. `onPublished(false)` significa "cobrado pero sin publicar": el saldo
  // ya está acreditado y quien llama debe rematar la publicación.
  publishFor?: PublishTarget;
  onPublished?: (published: boolean) => void;
}

const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];

// Solo los adicionales con costo (>0 en la matriz por defecto).
const EXTRA_DEFS: Array<{ key: keyof ExtraPrices; label: string; sub: string }> = [
  { key: "img500", label: "2ª imagen", sub: "mayor a 100 KB" },
  { key: "pdf500", label: "Adjuntar PDF", sub: "hasta 500 KB" },
  { key: "urgente", label: "Etiqueta Urgente", sub: "resalta el aviso" },
  { key: "destacado", label: "Aviso Destacado", sub: "aparece arriba" },
];

export function BuyCreditsModal({
  open, onClose, creditCost, currentBalance, onPurchaseComplete, publishFor, onPublished,
}: Props) {
  const [settings, setSettings] = useState<PricingSettings>(() => loadSettings());
  const [buying, setBuying] = useState(false);

  // Paso del flujo: "config" (arma la compra) → "paying" (formulario Izipay web).
  const [step, setStep] = useState<"config" | "paying">("config");
  const [payment, setPayment] = useState<CreatePaymentResult | null>(null);
  const [confirming, setConfirming] = useState(false); // polling del estado de la orden

  // Escape del modo pagar-y-publicar: quien prefiera cargar saldo por su cuenta
  // (para varios avisos, por ejemplo) vuelve al configurador de siempre.
  const [soloSaldo, setSoloSaldo] = useState(false);
  const modoPublicar = !!publishFor && !soloSaldo;

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

  // Al abrir: recarga la matriz de precios vigente y reinicia el flujo de pago.
  useEffect(() => {
    if (open) {
      fetchPricingSettings().then(setSettings);
      setStep("config");
      setPayment(null);
      setConfirming(false);
      setSoloSaldo(false);
    }
  }, [open]);

  const packageBase = useMemo(
    () => priceForDuration(quantity, duration, settings),
    [quantity, duration, settings],
  );
  // Los adicionales se cobran por día publicado, así que la duración entra aquí.
  const extrasSum = useMemo(() => extrasTotal(extras, duration, settings), [extras, duration, settings]);
  // Precio del configurador, en soles (dinero real, para la boleta).
  const configSoles = Math.round((packageBase + extrasSum) * 100) / 100;

  // En modo pagar-y-publicar el importe no lo arma el usuario: es lo que le
  // falta para su aviso. El servidor lo vuelve a calcular igual, así que esto
  // es solo lo que se le enseña antes de pagar.
  const faltante = publishFor
    ? Math.max(Math.round((publishFor.costCredits - currentBalance) * 100) / 100, 0)
    : 0;
  const aplicaMinimo = faltante > 0 && faltante < MIN_COBRO;
  const publishSoles = faltante > 0 ? Math.max(faltante, MIN_COBRO) : 0;

  const solesTotal = modoPublicar ? publishSoles : configSoles;
  // Créditos a comprar: soles × multiplicador.
  const creditsToBuy = solesToCredits(solesTotal);

  // Cierra el flujo según el resultado del pago (confirmado por el webhook).
  const finishOutcome = async (outcome: OrderOutcome, orderId: string) => {
    if (outcome === "paid") {
      const { balance, invoiceNumber, published } = await getPurchaseResult(orderId);

      if (modoPublicar) {
        // El aviso lo publica el servidor al liquidar. Si por lo que sea no
        // salió, el saldo quedó acreditado igual: se avisa al padre para que
        // remate la publicación, que ya tiene con qué pagarla.
        toast({
          title: published ? "¡Aviso publicado!" : "Pago aprobado",
          description: published
            ? `Ya está activo por ${publishFor?.durationDays} días.` +
              (invoiceNumber ? ` Comprobante: ${invoiceNumber}` : "")
            : "Recibimos tu pago. Estamos publicando tu aviso…",
        });
        onPublished?.(published === true);
        onClose();
        return;
      }

      toast({
        title: "¡Saldo acreditado!",
        description: `Se añadió ${formatCredits(creditsToBuy)} a tu saldo.` +
          (invoiceNumber ? ` Comprobante: ${invoiceNumber}` : ""),
      });
      onPurchaseComplete(balance);
      onClose();
    } else if (outcome === "failed") {
      toast({ title: "Pago no completado", description: "El pago no se aprobó. Puedes intentarlo de nuevo.", variant: "destructive" });
      setStep("config");
      setPayment(null);
    } else {
      toast({
        title: "Seguimos confirmando tu pago",
        description: modoPublicar
          ? "Si ya pagaste, tu aviso se publicará solo en unos minutos."
          : "Si ya pagaste, tu saldo se acreditará en unos minutos.",
      });
      onClose();
    }
  };

  // Validaciones comunes al pago real y al simulado. Devuelve los datos del
  // comprobante, o null si falta algo (y ya ha avisado con un toast).
  const datosDelComprobante = () => {
    if (!modoPublicar && creditsToBuy <= 0) {
      toast({ title: "Selecciona qué comprar", variant: "destructive" });
      return null;
    }
    if (!verifiedName) {
      toast({
        title: personType === "natural" ? "Verifica tu DNI" : "Verifica tu RUC",
        description: "Ingresa un documento válido para continuar (se valida automáticamente).",
        variant: "destructive",
      });
      return null;
    }
    if (!emailValid) { toast({ title: "Ingresa un correo válido", variant: "destructive" }); return null; }
    return {
      receiptType,
      email: email.trim(),
      advertiserName: verifiedName,
      docType: (personType === "natural" ? "dni" : "ruc") as "dni" | "ruc",
      docNumber: docNumber.trim(),
      factilizaData: docData,
    };
  };

  // Paso 1 → crea la orden y obtiene el formToken. En APK abre la página de pago
  // en el navegador del sistema (redirect); en web pasa al formulario embebido.
  const handleContinue = async () => {
    // En modo publicar el importe lo decide el servidor, que es quien conoce el
    // saldo real: si resulta que ya le alcanza, responde SaldoYaSuficiente y se
    // publica sin cobrar (ver el catch de abajo).
    const receipt = datosDelComprobante();
    if (!receipt) return;
    setBuying(true);
    try {
      const config: PurchaseConfig = {
        quantity,
        duration,
        extras: extras as Record<string, boolean | number>,
        receipt,
      };
      const result = modoPublicar && publishFor
        ? await createPublishPayment({
            listingId: publishFor.listingId,
            duration: publishFor.durationDays,
            receipt,
          })
        : await createPayment(config);

      if (Capacitor.isNativePlatform()) {
        // Redirect en móvil: el 3-D Secure corre en un navegador real, no en el WebView.
        const fallbackPk = (import.meta.env.VITE_IZIPAY_PUBLIC_KEY as string | undefined) ?? "";
        await Browser.open({ url: hostedPaymentUrl(result, fallbackPk) });
        setConfirming(true);
        const outcome = await pollOrderStatus(result.orderId, { timeoutMs: 180000 });
        await Browser.close().catch(() => { /* el usuario pudo cerrarlo ya */ });
        await finishOutcome(outcome, result.orderId);
      } else {
        // Embebido en web: pasamos al paso 2 con el formToken.
        setPayment(result);
        setStep("paying");
      }
    } catch (err: unknown) {
      // El saldo alcanzó entre que se abrió el modal y se pulsó pagar (otra
      // pestaña, un abono del admin): no se cobra nada y se publica.
      if (err instanceof SaldoYaSuficiente) {
        onPublished?.(false);
        onClose();
        return;
      }
      const msg = err instanceof Error ? err.message : "No se pudo iniciar el pago.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBuying(false);
      setConfirming(false);
    }
  };

  // El formulario embebido (web) avisó que la transacción quedó PAGADA.
  const handlePaid = async () => {
    if (!payment) return;
    setConfirming(true);
    const outcome = await pollOrderStatus(payment.orderId);
    await finishOutcome(outcome, payment.orderId);
    setConfirming(false);
  };

  const balanceAfter = currentBalance + creditsToBuy;
  const coversAd = balanceAfter >= creditCost;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="sm:max-w-lg overflow-y-auto"
        style={kbPad ? { paddingBottom: kbPad + 24 } : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet size={18} className="text-secondary" />
            {modoPublicar ? "Pagar y publicar" : "Comprar saldo"}
          </DialogTitle>
          <DialogDescription>
            {step === "paying"
              ? "Ingresa los datos de tu tarjeta en el formulario seguro de Izipay."
              : modoPublicar
                ? "Pagas solo lo que falta para este aviso y, en cuanto se apruebe, se publica solo."
                : "Arma tu compra: elige cantidad de avisos, duración y adicionales. Pagas justo lo que ves, en soles."}
          </DialogDescription>
        </DialogHeader>

        {step === "paying" && payment ? (
          /* ── Paso 2 (web): formulario embebido de Izipay ── */
          <div className="space-y-4">
            <div className="border border-secondary/30 bg-secondary/5 px-4 py-3 flex justify-between items-baseline gap-3">
              <span className="font-bold uppercase tracking-wider text-xs text-muted-foreground">Total a pagar</span>
              {/* El importe autoritativo es el que devolvió el servidor. */}
              <span className="text-3xl font-extrabold text-secondary tracking-tight">
                {formatSoles(payment.amount > 0 ? payment.amount : solesTotal)}
              </span>
            </div>

            {confirming ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" /> Confirmando tu pago…
              </p>
            ) : (
              <PaymentForm
                formToken={payment.formToken}
                publicKey={payment.publicKey || ((import.meta.env.VITE_IZIPAY_PUBLIC_KEY as string | undefined) ?? "")}
                onPaid={handlePaid}
                onError={(m) => toast({ title: "Pago", description: m, variant: "destructive" })}
              />
            )}

            {/* Quien va a teclear su tarjeta quiere saber a quién se la da y
                que puede echarse atrás. Ambas cosas, en una línea y sin ruido. */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStep("config"); setPayment(null); }}
                disabled={confirming}
                className="gap-1 -ml-2"
              >
                <ArrowLeft size={14} /> Volver
              </Button>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock size={12} className="text-success shrink-0" />
                Pago cifrado procesado por Izipay
              </span>
            </div>
          </div>
        ) : (
          /* ── Paso 1: configuración de la compra + datos del comprobante ── */
          <>
            {/* ── Modo pagar-y-publicar: el importe ya está decidido por el
                   aviso, así que en vez del configurador va su desglose ── */}
            {modoPublicar && publishFor && (
              <div className="border p-3 bg-secondary/5 space-y-1.5">
                <p className="font-bold text-sm leading-snug line-clamp-2">{publishFor.title}</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Publicación por {publishFor.durationDays} días</span>
                  <span className="font-semibold">{formatCredits(publishFor.costCredits)}</span>
                </div>
                {currentBalance > 0 && (
                  <div className="flex justify-between text-xs text-success">
                    <span>Tu saldo actual</span>
                    <span className="font-semibold">− {formatCredits(Math.min(currentBalance, publishFor.costCredits))}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between items-baseline">
                  <span className="font-bold uppercase tracking-wider text-xs">A pagar ahora</span>
                  <span className="text-3xl font-extrabold text-secondary tracking-tight">{formatSoles(solesTotal)}</span>
                </div>
                {aplicaMinimo && (
                  <p className="text-[11px] text-muted-foreground">
                    El cobro mínimo por tarjeta es {formatSoles(MIN_COBRO)}; la diferencia te queda como saldo.
                  </p>
                )}
                <p className="flex items-start gap-1.5 text-[11px] text-success">
                  <CheckCircle2 size={13} className="mt-px shrink-0" />
                  En cuanto se apruebe el pago, tu aviso se publica automáticamente.
                </p>
              </div>
            )}

            {/* Aviso: cuántos créditos necesita para publicar */}
            {!modoPublicar && creditCost > 0 && (
              <div className="text-xs border p-3 bg-muted/30 flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  Para publicar tu aviso necesitas <b className="text-foreground">{formatCredits(creditCost)}</b>
                  {deficit > 0 && <> · tu saldo: {formatCredits(currentBalance)}</>}
                </span>
                {deficit > 0 && <span className="font-bold text-destructive whitespace-nowrap">Faltan {formatCredits(deficit)}</span>}
              </div>
            )}

            {!modoPublicar && (
            <>
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
                      <p className="text-[11px] text-muted-foreground">{formatCredits(solesToCredits(p))}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Adicionales */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Características extra</Label>
              {/* Su precio es por día: el importe que se enseña en cada tarjeta
                  ya viene multiplicado por la duración elegida arriba. */}
              <p className="text-[11px] text-muted-foreground">
                Se cobran por día, así que su costo ya incluye los {duration} días.
              </p>
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
                      <p className="text-xs font-semibold text-secondary mt-1">+{formatCredits(solesToCredits(unit * duration))}</p>
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
                <span className="font-semibold">{formatCredits(solesToCredits(packageBase))}</span>
              </div>
              {extrasSum > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Adicionales × {duration} días</span>
                  <span className="font-semibold">{formatCredits(solesToCredits(extrasSum))}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between items-baseline">
                <span className="font-bold uppercase tracking-wider text-xs">Saldo a comprar</span>
                <span className="text-2xl font-extrabold text-secondary">{formatCredits(creditsToBuy)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Pagas (boleta)</span>
                <span className="font-semibold">{formatSoles(solesTotal)}</span>
              </div>
              {creditCost > 0 && (
                <p className={`text-[11px] ${coversAd ? "text-success" : "text-destructive"}`}>
                  {coversAd
                    ? "✓ Con esta compra podrás publicar tu aviso."
                    : `Aún faltarían ${formatCredits(creditCost - balanceAfter)} para publicar tu aviso.`}
                </p>
              )}
            </div>
            </>
            )}

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
                {/* Sin `maxLength`: recortaría el texto pegado antes de quitarle los
                    espacios. El tope lo aplica normalizeDocNumber, ya sobre dígitos. */}
                <Input value={docNumber} onFocus={scrollFocusedIntoView}
                  onChange={(e) => setDocNumber(normalizeDocNumber(e.target.value, personType === "natural" ? 8 : 11))}
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

            {/* Quien quiera cargar saldo por su cuenta (para varios avisos, o
                para dejarlo listo) no pierde esa vía: el configurador de
                siempre sigue a un clic. */}
            {modoPublicar && (
              <button
                type="button"
                onClick={() => setSoloSaldo(true)}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground self-start"
              >
                Prefiero solo comprar saldo
              </button>
            )}

            <DialogFooter className="gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={buying}>Cancelar</Button>
              <Button
                onClick={handleContinue}
                disabled={buying || (!modoPublicar && creditsToBuy <= 0) || verifyingDoc || !verifiedName || !emailValid}
                className="gap-2"
              >
                {buying
                  ? <><Loader2 size={14} className="animate-spin" /> {confirming ? "Confirmando…" : "Procesando…"}</>
                  : <><CreditCard size={14} /> {modoPublicar ? "Pagar y publicar" : "Continuar al pago"} · {formatSoles(solesTotal)}</>}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
