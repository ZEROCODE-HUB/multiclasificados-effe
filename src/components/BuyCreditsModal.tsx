import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, User, Building2, Globe, Check, CheckCircle2, AlertCircle, Loader2, Minus, Plus, CreditCard, ArrowLeft, Lock, Smartphone } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  loadSettings, priceForDuration, extrasTotal, formatSoles, formatCredits, solesToCredits,
  type DurationDays, type ExtrasSelection, type PricingSettings, type ExtraPrices,
} from "@/lib/pricing";
import { fetchPricingSettings } from "@/lib/pricingRemote";
import { paisPreferido } from "@/lib/paises";
import { SelectorDePais } from "@/components/SelectorDePais";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useValidacion, MensajeDeError } from "@/hooks/useValidacion";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { verifyDocument, normalizeDocNumber, normalizeDocAlfanumerico } from "@/lib/verifyDoc";
import { fetchMyIdentity, saveMyIdentity } from "@/lib/identity";
import {
  createPayment, createPublishPayment, pollOrderStatus, getPurchaseResult, hostedPaymentUrl,
  SaldoYaSuficiente, esPagoManual,
  type PurchaseConfig, type CreatePaymentResult, type PagoManualCreado, type OrderOutcome,
} from "@/lib/payments";
import { PaymentForm, precargarKrypton } from "@/components/PaymentForm";
import { PagoManualPanel } from "@/components/PagoManualPanel";
import {
  configYapePlin, mediosDisponibles, NOMBRE_MEDIO, CONFIG_VACIA,
  type ConfigYapePlin, type MedioManual,
} from "@/lib/pagoManual";

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
  /** "renew" suma días a un aviso vivo en vez de publicar uno en borrador. */
  purpose?: "publish" | "renew";
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
  // Yape/Plin: la compra quedó registrada y espera que el equipo confirme el
  // pago. No es un éxito ni un fallo, es una tercera salida — y quien abrió
  // este cuadro desde otro diálogo necesita cerrarlo también y explicar la
  // espera, en vez de dejar al usuario delante de un "Publicar" que ya pulsó.
  onPagoEnEspera?: (info: { orderId: string; medio: MedioManual }) => void;
}

const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];

// Solo los adicionales con costo (>0 en la matriz por defecto).
const EXTRA_DEFS: Array<{ key: keyof ExtraPrices; label: string; sub: string }> = [
  // Decía "2ª imagen · mayor a 100 KB" mientras la pantalla de publicar decía
  // "Imagen adicional · hasta 500 KB · hasta 3" para el MISMO adicional. Manda
  // lo que hace el sistema.
  { key: "img500", label: "Imagen adicional", sub: "hasta 3 · hasta 500 KB" },
  { key: "pdf500", label: "Adjuntar PDF", sub: "hasta 500 KB" },
  { key: "urgente", label: "Etiqueta Urgente", sub: "resalta el aviso" },
  { key: "destacado", label: "Aviso Destacado", sub: "aparece arriba" },
];

export function BuyCreditsModal({
  open, onClose, creditCost, currentBalance, onPurchaseComplete, publishFor, onPublished, onPagoEnEspera,
}: Props) {
  const [settings, setSettings] = useState<PricingSettings>(() => loadSettings());
  const [buying, setBuying] = useState(false);

  // Paso del flujo: "config" (arma la compra) → "paying" (formulario Izipay web).
  const [step, setStep] = useState<"config" | "paying" | "manual">("config");
  const [payment, setPayment] = useState<CreatePaymentResult | null>(null);
  // Cómo se paga. La tarjeta es lo de siempre; Yape y Plin solo aparecen si
  // están configurados con al menos una cuenta y un WhatsApp (0117).
  const [medioPago, setMedioPago] = useState<"tarjeta" | MedioManual>("tarjeta");
  const [cfgManual, setCfgManual] = useState<ConfigYapePlin>(CONFIG_VACIA);
  const [manual, setManual] = useState<PagoManualCreado | null>(null);
  const [confirming, setConfirming] = useState(false); // polling del estado de la orden

  // Escape del modo pagar-y-publicar: quien prefiera cargar saldo por su cuenta
  // (para varios avisos, por ejemplo) vuelve al configurador de siempre.
  const [soloSaldo, setSoloSaldo] = useState(false);
  const modoPublicar = !!publishFor && !soloSaldo;
  // Renovar NO publica: el aviso ya está fuera y lo que compra son días. Decirle
  // "se publica" a quien renueva le hace dudar de si su aviso se cayó.
  const esRenovar = modoPublicar && publishFor?.purpose === "renew";

  // Configurador de la compra
  const [quantity, setQuantity] = useState(1);
  const [duration, setDuration] = useState<DurationDays>(7);
  const [extras, setExtras] = useState<ExtrasSelection>({});

  // Datos de comprobante
  const [personType, setPersonType] = useState<"natural" | "juridica" | "extranjera">("natural");
  const [docNumber, setDocNumber] = useState("");
  // Extranjero: no hay a quien preguntarle si el documento existe (RENIEC solo
  // sabe de peruanos), asi que los datos los escribe la persona y van tal cual a
  // su boleta. Se le dice con todas las letras.
  const [nombreExtranjero, setNombreExtranjero] = useState("");
  const [docExtranjero, setDocExtranjero] = useState<"pasaporte" | "ce">("pasaporte");
  const [paisCliente, setPaisCliente] = useState<string>(() => paisPreferido().code);
  const [email, setEmail] = useState("");
  const [receiptType, setReceiptType] = useState<"boleta" | "factura">("boleta");

  // Verificación del documento con Factiliza (nombre/razón social + datos).
  const [verifiedName, setVerifiedName] = useState("");
  const val = useValidacion();
  const [docData, setDocData] = useState<Record<string, unknown> | null>(null);
  const [verifyingDoc, setVerifyingDoc] = useState(false);
  const [docError, setDocError] = useState("");
  // El servidor cortó por exceso de consultas: no tiene sentido seguir probando.
  const [docBloqueado, setDocBloqueado] = useState(false);

  /**
   * Documentos ya resueltos en esta sesión del modal, para no volver a
   * preguntar por el mismo. Cada consulta a Factiliza se paga, y corregir un
   * dígito y volver a escribirlo disparaba otra.
   */
  const consultados = useRef(new Map<string, { nombre: string; data: Record<string, unknown> | null }>());

  const deficit = Math.max(0, creditCost - currentBalance);

  // En el APK, reserva el alto del teclado y centra el campo enfocado.
  const { kbPad, scrollFocusedIntoView } = useKeyboardInset();

  // Al completar el documento (DNI 8 / RUC 11) lo consultamos en Factiliza y
  // mostramos el nombre/razón social.
  //
  // Antes se consultaba en cuanto había 8 u 11 dígitos, sin más. Escribiendo
  // del tirón eso está bien, pero corregir el último dígito de un DNI mal
  // tecleado disparaba dos consultas, y cada una se paga. Ahora se espera a que
  // la persona deje de escribir, y lo ya preguntado no se vuelve a preguntar:
  // ni en esta sesión (`consultados`) ni entre sesiones (el servidor guarda 30
  // días, ver migración 0106).
  useEffect(() => {
    // Un extranjero no se verifica contra nadie: su nombre lo escribe el.
    if (personType === "extranjera") {
      setDocError("");
      setVerifyingDoc(false);
      setDocData(null);
      setVerifiedName(nombreExtranjero.trim());
      return;
    }
    const docType = personType === "natural" ? "dni" : "ruc";
    const requiredLen = personType === "natural" ? 8 : 11;
    setDocError("");
    if (docNumber.length !== requiredLen) {
      setVerifiedName("");
      setDocData(null);
      setVerifyingDoc(false);
      return;
    }

    // Ya resuelto antes: se responde de memoria, sin gastar una consulta.
    const clave = `${docType}:${docNumber}`;
    const enMemoria = consultados.current.get(clave);
    if (enMemoria) {
      setVerifiedName(enMemoria.nombre);
      setDocData(enMemoria.data);
      setVerifyingDoc(false);
      return;
    }

    let cancelled = false;
    setVerifyingDoc(true);
    setVerifiedName("");
    setDocData(null);

    // Espera a que deje de teclear. Sin esto, un documento escrito con una
    // corrección al final cuesta dos consultas en vez de una.
    const t = setTimeout(() => {
      verifyDocument(docType, docNumber)
        .then((r) => {
          if (cancelled) return;
          if (r.ok) {
            const nombre = r.nombre ?? "";
            const data = r.data ?? null;
            consultados.current.set(clave, { nombre, data });
            setVerifiedName(nombre);
            setDocData(data);
            setDocBloqueado(false);
            // Queda en el perfil: la próxima compra ya no lo pregunta.
            void saveMyIdentity({ docType, docNumber, name: nombre });
          } else {
            setDocError(r.error ?? "No se pudo verificar el documento.");
            setDocBloqueado(!!r.rateLimited);
          }
        })
        .catch(() => { if (!cancelled) setDocError("No se pudo verificar el documento."); })
        .finally(() => { if (!cancelled) setVerifyingDoc(false); });
    }, 600);

    return () => { cancelled = true; clearTimeout(t); };
  }, [docNumber, personType, nombreExtranjero]);

  const emailValid = EMAIL_RE.test(email.trim());
  // Campo de Factiliza; "" si no viene o viene vacío (varios llegan en blanco).
  const docField = (k: string): string => {
    const v = docData?.[k];
    return typeof v === "string" && v.trim() ? v.trim() : "";
  };

  // Ficha a mostrar tras verificar.
  //
  // El domicilio NO se muestra, ni el del DNI ni el fiscal del RUC. Enseñar en
  // pantalla la dirección de casa de alguien para confirmar que el DNI es
  // correcto no hace falta —con el nombre basta— y en un móvil, delante de
  // quien sea, es un dato que sobra. Sigue guardado en el comprobante si
  // Factiliza lo devolvió.
  const docRows: Array<[string, string]> = personType === "natural"
    ? [
        ["DNI", docNumber],
      ]
    : [
        ["RUC", docNumber],
        ["Estado", docField("estado")],
        ["Condición", docField("condicion")],
        ["Tipo", docField("tipo_contribuyente")],
      ];

  // Corta el sondeo del pago cuando el usuario cierra el cuadro. `pollOrderStatus`
  // siempre aceptó una señal de cancelación, pero nadie se la pasaba: en el APK
  // podía seguir consultando la orden hasta tres minutos después de cerrar.
  const sondeo = useRef<{ aborted: boolean }>({ aborted: false });

  // Al abrir: recarga la matriz de precios vigente y reinicia el flujo de pago.
  useEffect(() => {
    if (open) {
      sondeo.current = { aborted: false };
      // El formulario de tarjeta vive en el CDN de la pasarela y son tres
      // recursos encadenados: se piden ya, mientras se elige qué comprar.
      //
      // La clave del build se usa AQUÍ y solo aquí, para traer el script del
      // CDN antes de tener respuesta del servidor. No decide con qué cuenta se
      // cobra: eso lo fija `PaymentForm` con la que devuelve `create-payment`.
      precargarKrypton(undefined, (import.meta.env.VITE_IZIPAY_PUBLIC_KEY as string | undefined) ?? "");
      fetchPricingSettings().then(setSettings);
      configYapePlin().then(setCfgManual);
      setStep("config");
      setPayment(null);
      setManual(null);
      setMedioPago("tarjeta");
      setConfirming(false);
      setSoloSaldo(false);
    } else {
      sondeo.current.aborted = true;
    }
  }, [open]);

  // Al abrir, trae el documento que ya verificó en una compra o publicación
  // anterior. Quien compra por segunda vez no tiene que volver a escribirlo ni
  // esperar a que se verifique: la consulta ya se pagó una vez.
  useEffect(() => {
    if (!open) return;
    let active = true;
    fetchMyIdentity().then((id) => {
      if (!active || !id) return;

      if (id.docNumber && id.docType && id.name) {
        const tipo = id.docType === "ruc" ? "juridica" : "natural";
        // Se marca como ya consultado ANTES de escribir el número, para que el
        // efecto de verificación lo tome de aquí y no salga a Factiliza.
        consultados.current.set(`${id.docType}:${id.docNumber}`, {
          nombre: id.name,
          // El domicilio no se guarda en el perfil y ya no se muestra; el
          // comprobante no lo necesita.
          data: null,
        });
        setPersonType(tipo);
        setReceiptType(tipo === "juridica" ? "factura" : "boleta");
        setDocNumber(id.docNumber);
        setVerifiedName(id.name);
      }

      // El correo del comprobante: el de la cuenta como punto de partida, que
      // es lo que casi siempre quiere. Se puede cambiar antes de pagar.
      if (id.accountEmail) setEmail((actual) => actual || id.accountEmail);
    });
    return () => { active = false; };
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
        description: esRenovar
          ? "Si ya pagaste, tu aviso sumará sus días en unos minutos."
          : modoPublicar
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
    // El botón ya no se queda muerto sin explicar por qué: se valida al pulsar
    // y se señala el campo que falta.
    const reglas = [
      {
        campo: "documento",
        ok: personType === "extranjera"
          ? nombreExtranjero.trim().length >= 3 && docNumber.trim().length >= 6
          : !!verifiedName,
        mensaje: personType === "extranjera"
          ? (nombreExtranjero.trim().length < 3
              ? "Escribe tu nombre completo tal como debe salir en la boleta."
              : "Escribe el número de tu documento.")
          : verifyingDoc
            ? "Espera a que termine la verificación del documento."
            : personType === "natural"
              ? "Ingresa tu DNI para emitir la boleta."
              : "Ingresa el RUC de la empresa para emitir la factura.",
      },
      { campo: "correo", ok: emailValid, mensaje: "Ingresa un correo válido para recibir el comprobante." },
    ];
    if (!val.validar(reglas)) {
      const fallo = reglas.find((r) => !r.ok)!;
      toast({ title: "Falta un dato", description: fallo.mensaje, variant: "destructive" });
      return null;
    }
    return {
      receiptType,
      email: email.trim(),
      advertiserName: verifiedName,
      docType: (personType === "natural" ? "dni" : personType === "juridica" ? "ruc" : docExtranjero) as
        "dni" | "ruc" | "ce" | "pasaporte",
      docNumber: docNumber.trim(),
      country: paisCliente,
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
      const provider = medioPago === "tarjeta" ? undefined : medioPago;
      const result = modoPublicar && publishFor
        ? await createPublishPayment({
            listingId: publishFor.listingId,
            duration: publishFor.durationDays,
            receipt,
            purpose: publishFor.purpose ?? "publish",
            provider,
          })
        : await createPayment({ ...config, provider });

      // Yape/Plin: no hay pasarela que abrir. La orden ya quedó esperando
      // aprobación y ahora toca decirle a dónde transferir.
      if (esPagoManual(result)) {
        setManual(result);
        setStep("manual");
        return;
      }

      if (Capacitor.isNativePlatform()) {
        // Redirect en móvil: el 3-D Secure corre en un navegador real, no en el WebView.
        await Browser.open({ url: hostedPaymentUrl(result) });
        setConfirming(true);
        const outcome = await pollOrderStatus(result.orderId, { timeoutMs: 180000, signal: sondeo.current });
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
    const outcome = await pollOrderStatus(payment.orderId, { signal: sondeo.current });
    await finishOutcome(outcome, payment.orderId);
    setConfirming(false);
  };

  // Qué medios manuales se pueden ofrecer con la configuración actual.
  const mediosManuales = useMemo(() => mediosDisponibles(cfgManual), [cfgManual]);

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
            {esRenovar ? "Pagar y renovar" : modoPublicar ? "Pagar y publicar" : "Comprar saldo"}
          </DialogTitle>
          <DialogDescription>
            {step === "manual"
              ? `Transfiere por ${manual ? NOMBRE_MEDIO[manual.provider] : "Yape"} y mándanos el voucher: nosotros hacemos el resto.`
              : step === "paying"
              ? "Ingresa los datos de tu tarjeta en el formulario seguro de Izipay."
              : esRenovar
                ? "Pagas solo lo que falta y, en cuanto se apruebe, tu aviso suma los días nuevos."
                : modoPublicar
                ? "Pagas solo lo que falta para este aviso y, en cuanto se apruebe, se publica solo."
                : "Arma tu compra: elige cantidad de avisos, duración y adicionales. Pagas justo lo que ves, en soles."}
          </DialogDescription>
        </DialogHeader>

        {step === "manual" && manual ? (
          /* ── Paso 2 (Yape/Plin): a dónde transferir y cómo avisarnos ── */
          <PagoManualPanel
            orderId={manual.orderId}
            medio={manual.provider}
            monto={manual.amount > 0 ? manual.amount : solesTotal}
            cuentas={manual.cuentas}
            whatsapp={manual.whatsapp}
            mensaje={manual.mensaje}
            nombre={verifiedName}
            publicaAviso={modoPublicar}
            esRenovacion={esRenovar}
            onListo={() => {
              if (onPagoEnEspera) onPagoEnEspera({ orderId: manual.orderId, medio: manual.provider });
              else onClose();
            }}
            onVolver={() => { setStep("config"); setManual(null); }}
          />
        ) : step === "paying" && payment ? (
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
                publicKey={payment.publicKey ?? ""}
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
                  <span className="text-muted-foreground">
                    {esRenovar ? "Renovación" : "Publicación"} por {publishFor.durationDays} días
                  </span>
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
                  {esRenovar
                    ? `En cuanto se apruebe el pago, tu aviso suma ${publishFor.durationDays} días a los que le quedan.`
                    : "En cuanto se apruebe el pago, tu aviso se publica automáticamente."}
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

            {/* ── Cómo se paga ──
                Solo aparece si hay algún medio manual configurado: con nada que
                elegir, un selector de una sola opción es ruido. */}
            {mediosManuales.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                  Cómo quieres pagar
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button"
                    onClick={() => setMedioPago("tarjeta")}
                    className={`p-3 border text-left transition-all ${medioPago === "tarjeta" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}>
                    <CreditCard size={16} className="text-secondary mb-1" />
                    <p className="font-bold text-xs">Tarjeta</p>
                    <p className="text-[10px] text-muted-foreground">Al instante</p>
                  </button>
                  {mediosManuales.map((m) => (
                    <button key={m} type="button"
                      onClick={() => setMedioPago(m)}
                      className={`p-3 border text-left transition-all ${medioPago === m ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}>
                      <Smartphone size={16} className="text-secondary mb-1" />
                      <p className="font-bold text-xs">{NOMBRE_MEDIO[m]}</p>
                      <p className="text-[10px] text-muted-foreground">Lo revisamos</p>
                    </button>
                  ))}
                </div>
                {medioPago !== "tarjeta" && (
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    {esRenovar
                      ? "Transfieres, nos mandas el voucher por WhatsApp y tu aviso suma sus días en cuanto confirmemos el pago."
                      : modoPublicar
                      ? "Transfieres, nos mandas el voucher por WhatsApp y tu aviso se publica solo en cuanto confirmemos el pago."
                      : "Transfieres, nos mandas el voucher por WhatsApp y el saldo entra en cuanto confirmemos el pago."}
                  </p>
                )}
              </div>
            )}

            {/* Datos de comprobante */}
            <div className="space-y-3 border-t pt-3">
              <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Datos del comprobante</Label>
              <div className="grid grid-cols-3 gap-2">
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
                <button type="button"
                  onClick={() => { setPersonType("extranjera"); setReceiptType("boleta"); setDocNumber(""); }}
                  className={`p-3 border text-left transition-all ${personType === "extranjera" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}>
                  <Globe size={16} className="text-secondary mb-1" />
                  <p className="font-bold text-xs">Extranjero</p>
                  <p className="text-[10px] text-muted-foreground">Boleta · Pasaporte</p>
                </button>
              </div>
              {personType === "extranjera" ? (
                <div {...val.props("documento")} className="space-y-3">
                  <MensajeDeError campo="documento" errores={val.errores} />
                  <div>
                    <Label className="text-xs">Nombre completo <span className="text-destructive">*</span></Label>
                    <Input value={nombreExtranjero} onFocus={scrollFocusedIntoView}
                      onChange={(e) => setNombreExtranjero(e.target.value)}
                      placeholder="Tal como debe salir en la boleta" className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Documento</Label>
                      <Select value={docExtranjero} onValueChange={(v) => { setDocExtranjero(v as "pasaporte" | "ce"); setDocNumber(""); }}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pasaporte">Pasaporte</SelectItem>
                          <SelectItem value="ce">Carné de extranjería</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Número <span className="text-destructive">*</span></Label>
                      <Input value={docNumber} onFocus={scrollFocusedIntoView}
                        onChange={(e) => setDocNumber(normalizeDocAlfanumerico(e.target.value, 12))}
                        placeholder="AB123456" className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">País</Label>
                    <SelectorDePais
                      className="mt-1"
                      value={paisCliente}
                      onChange={(v) => { if (v) setPaisCliente(v); }}
                      aria-label="País"
                    />
                  </div>
                  {/* Decirlo claro: nadie comprueba estos datos, y salen tal
                      cual en un documento con valor tributario. */}
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    No verificamos este documento con RENIEC ni SUNAT: los datos que escribas
                    salen tal cual en tu boleta.
                  </p>
                </div>
              ) : (
              <div {...val.props("documento")}>
                <Label className="text-xs">
                  {personType === "natural" ? "DNI (8 dígitos)" : "RUC (11 dígitos)"} <span className="text-destructive">*</span>
                </Label>
                <MensajeDeError campo="documento" errores={val.errores} />
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
                  <div className={`mt-2 flex items-start gap-1.5 text-xs ${docBloqueado ? "rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-muted-foreground" : "text-destructive"}`}>
                    <AlertCircle size={13} className={`mt-0.5 shrink-0 ${docBloqueado ? "text-destructive" : ""}`} />
                    <span>
                      {docError}
                      {/* Cuando el corte es por cantidad de intentos, seguir
                          escribiendo documentos no arregla nada: hay que decir
                          por dónde sale. */}
                      {docBloqueado && (
                        <> Si ya verificaste tu documento antes, ciérralo y vuelve a abrirlo: se carga solo.</>
                      )}
                    </span>
                  </div>
                )}
              </div>
              )}
              <div {...val.props("correo")}>
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

            {/* "Solicitar devolución de saldo" ESTABA AQUÍ y se retiró
                (2026-09-02, a pedido del cliente). Dos motivos:

                1. NO FUNCIONABA BIEN. Era un `mailto:` pelado. Si el equipo no
                   tiene un cliente de correo configurado —lo normal en un
                   Windows de oficina, y en un móvil sin la app de correo
                   enlazada—, pulsar no hace NADA visible y la persona se queda
                   creyendo que escribió. Tratándose de dinero, eso es lo peor
                   que puede pasar. `DevolucionSaldoDialog` se creó justo para
                   arreglarlo (ofrece el correo Y la dirección copiable), pero
                   este enlace viejo se quedó aquí sin quitar.

                2. NO ERA SU SITIO. Estaba enterrado dentro del flujo de COMPRAR:
                   había que abrir el cuadro de comprar saldo para encontrar cómo
                   pedir que te lo devuelvan.

                Ahora vive en el menú "Mi cuenta" (Navbar) y en "Mi saldo"
                (AdvertiserDashboard), los dos abriendo el diálogo. */}

            <DialogFooter className="gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={buying}>Cancelar</Button>
              <Button
                onClick={handleContinue}
                disabled={buying || (!modoPublicar && creditsToBuy <= 0) || verifyingDoc}
                className="gap-2"
              >
                {buying
                  ? <><Loader2 size={14} className="animate-spin" /> {confirming ? "Confirmando…" : "Procesando…"}</>
                  : medioPago === "tarjeta"
                    ? <><CreditCard size={14} /> {esRenovar ? "Pagar y renovar" : modoPublicar ? "Pagar y publicar" : "Continuar al pago"} · {formatSoles(solesTotal)}</>
                    : <><Smartphone size={14} /> Pagar con {NOMBRE_MEDIO[medioPago]} · {formatSoles(solesTotal)}</>}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
