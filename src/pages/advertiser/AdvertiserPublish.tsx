import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ImagePlus, X, ArrowLeft, ArrowRight, Star, Check, MapPin, Tag, FileText, Camera,
  ShieldCheck, Building2, User, CreditCard, Receipt, Sparkles, Flame, EyeOff, Lock, Package, Minus, Plus,
  Wallet, Loader2, Percent,
} from "lucide-react";
import { categories } from "@/data/mockData";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { toast } from "@/hooks/use-toast";
import {
  loadSettings, priceForDuration, formatSoles, addInvoice, avisosBreakdown, solesToCredits,
  type DurationDays, type PricingSettings, type ExtraPrices,
} from "@/lib/pricing";
import { createAndPublishListing } from "@/lib/publish";
import { verifyDocument } from "@/lib/verifyDoc";
import { getCreditBalance, spendCredits } from "@/lib/credits";
import { fetchActivePromotions, bestPromoForCategory, applyDiscount, type Promotion } from "@/lib/promotions";
import { fetchPricingSettings } from "@/lib/pricingRemote";
import { BuyCreditsModal } from "@/components/BuyCreditsModal";
import { LocationPicker } from "@/components/LocationPicker";
import { supabase } from "@/lib/supabase";

interface PhotoItem { id: string; url: string; name: string; file: File; }

const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];

// Extras del paquete (cantidad numérica por cada uno)
type ExtraKey = "img500" | "pdf500" | "urgente" | "destacado" | "confidencial";
const EXTRA_DEFS: Array<{ key: ExtraKey; label: string; sub?: string; icon: typeof Sparkles }> = [
  { key: "img500", label: "Segunda imagen por aviso", sub: "hasta 500 KB", icon: ImagePlus },
  { key: "pdf500", label: "PDF adjunto por aviso", sub: "hasta 500 KB", icon: FileText },
  { key: "urgente", label: "Marcar como Urgente", icon: Flame },
  { key: "destacado", label: "Marcar como Destacado", icon: Star },
  { key: "confidencial", label: "Marcar como Confidencial", icon: EyeOff },
];

type ExtrasCount = Partial<Record<ExtraKey, number>>;

const DRAFT_KEY = "effe:publish-draft";

const AdvertiserPublish = () => {
  const session = useSession();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // Guardia: para publicar hay que haber iniciado sesión (cuenta real).
  // Si no hay sesión de Supabase, redirige al login al entrar.
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        navigate("/auth?redirect=/dashboard/anunciante/publicar", { replace: true });
      } else {
        setAuthChecked(true);
        setUserEmail(data.session.user.email ?? "");
      }
    });
    return () => { active = false; };
  }, [navigate]);

  // Verificación de identidad (se solicita al presionar "Publicar aviso")
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [personType, setPersonType] = useState<"natural" | "juridica" | "">("");
  const [docNumber, setDocNumber] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState("");

  // Imágenes — solo 2 slots por aviso
  const [mainPhoto, setMainPhoto] = useState<PhotoItem | null>(null);
  const [secondPhoto, setSecondPhoto] = useState<PhotoItem | null>(null);
  const secondFileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category: "",
    title: "",
    description: "",
    price: "",
    currency: "PEN",
    location: "",
    condition: "nuevo",
  });

  // Coordenadas del aviso (para el mapa del buscador). Se fijan geocodificando
  // el texto de ubicación o arrastrando el pin en el LocationPicker.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Un aviso a la vez: el precio depende de la duración + adicionales.
  // La compra "por volumen" vive en el modal de créditos, no aquí.
  const [quantity] = useState<number>(1);
  const [duration, setDuration] = useState<DurationDays>(7);
  const [extras, setExtras] = useState<ExtrasCount>({});

  // Créditos
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditLoading, setCreditLoading] = useState(true);
  // Promociones vigentes (para descontar automáticamente al publicar).
  const [promos, setPromos] = useState<Promotion[]>([]);

  // Flujo de publicación con créditos
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [successOpen, setSuccessOpen] = useState<{ open: boolean; number: string; email: string }>({ open: false, number: "", email: "" });

  // Pricing en vivo: arranca del caché local y se refresca desde la BD.
  const [settings, setSettings] = useState<PricingSettings>(() => loadSettings());
  useEffect(() => {
    fetchPricingSettings().then(setSettings);
    const sync = () => setSettings(loadSettings());
    window.addEventListener("effe:pricing-updated", sync);
    return () => window.removeEventListener("effe:pricing-updated", sync);
  }, []);

  // Cargar saldo de créditos al montar (una vez autenticado)
  useEffect(() => {
    if (!authChecked) return;
    setCreditLoading(true);
    getCreditBalance().then((b) => { setCreditBalance(b); setCreditLoading(false); });
    fetchActivePromotions().then(setPromos);
  }, [authChecked]);

  // Restaurar borrador y reanudar flujo tras login
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.form) setForm(d.form);
      if (d.coords) setCoords(d.coords);
      if (d.duration) setDuration(d.duration);
      if (d.extras) setExtras(d.extras);
      if (d.verified) setVerified(d.verified);
      if (d.personType) setPersonType(d.personType);
      if (d.docNumber) setDocNumber(d.docNumber);
      if (d.verifiedName) setVerifiedName(d.verifiedName);
      if (d.resumeAtSummary && session) {
        setTimeout(() => openPublishFlowAfterVerify(), 200);
      }
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packageBase = priceForDuration(quantity, duration, settings);
  const extrasSum = EXTRA_DEFS.reduce((acc, def) => {
    const c = extras[def.key] ?? 0;
    return acc + c * (settings.extras[def.key as keyof ExtraPrices] ?? 0);
  }, 0);
  const baseTotal = Math.round((packageBase + extrasSum) * 100) / 100;
  // Promoción vigente para la categoría elegida (si la hay).
  const activePromo = bestPromoForCategory(promos, form.category);
  const promoPct = activePromo?.discount_pct ?? 0;
  const total = applyDiscount(baseTotal, promoPct);
  // Costo EN CRÉDITOS (enteros). El dinero (soles) va en `total`/`baseTotal`.
  const baseCredits = solesToCredits(baseTotal);
  const totalCredits = solesToCredits(total);
  const balanceCredits = Math.round(creditBalance);
  // Para la vista previa del aviso individual
  const basePrice = priceForDuration(1, duration, settings);

  const updateForm = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const pickPhoto = (slot: "main" | "second", files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    const item: PhotoItem = {
      id: `${slot}-${Date.now()}`,
      url: URL.createObjectURL(f),
      name: f.name,
      file: f,
    };
    if (slot === "main") setMainPhoto(item);
    else setSecondPhoto(item);
  };

  const setExtraCount = (key: ExtraKey, count: number) => {
    const max = quantity;
    const v = Math.max(0, Math.min(max, count));
    setExtras((e) => ({ ...e, [key]: v }));
  };

  // Si cambia la cantidad, recortar extras al nuevo máximo
  useEffect(() => {
    setExtras((prev) => {
      const next: ExtrasCount = {};
      (Object.keys(prev) as ExtraKey[]).forEach((k) => {
        next[k] = Math.min(prev[k] ?? 0, quantity);
      });
      return next;
    });
  }, [quantity]);

  const hasSecondImageInPackage = (extras.img500 ?? 0) > 0;

  const persistDraftForLogin = (resumeAtSummary: boolean) => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        form, coords, duration, quantity, extras, verified: true, personType, docNumber, verifiedName,
        resumeAtSummary,
      }));
    } catch { /* noop */ }
  };

  const handleVerify = async () => {
    if (verifying) return;
    if (personType === "natural" && docNumber.length !== 8) {
      toast({ title: "DNI inválido", description: "El DNI debe tener 8 dígitos.", variant: "destructive" });
      return;
    }
    if (personType === "juridica" && docNumber.length !== 11) {
      toast({ title: "RUC inválido", description: "El RUC debe tener 11 dígitos.", variant: "destructive" });
      return;
    }

    // Verificación real contra Factiliza (a través de la Edge Function).
    const tipo = personType === "natural" ? "dni" : "ruc";
    setVerifying(true);
    let result;
    try {
      result = await verifyDocument(tipo, docNumber);
    } finally {
      setVerifying(false);
    }

    if (!result.ok) {
      toast({
        title: tipo === "dni" ? "DNI no verificado" : "RUC no verificado",
        description: result.error ?? "No se pudo verificar el documento. Revisa el número.",
        variant: "destructive",
      });
      return;
    }

    const nombre = result.nombre ?? "";
    setVerifiedName(nombre);
    setVerified(true);
    setVerifyOpen(false);
    toast({
      title: "Identidad verificada",
      description: nombre
        ? `${personType === "natural" ? "DNI" : "RUC"} ${docNumber} · ${nombre}`
        : `${personType === "natural" ? "DNI" : "RUC"} ${docNumber} confirmado.`,
    });

    // Tras verificar exige login antes del pago
    if (!session) {
      persistDraftForLogin(true);
      toast({ title: "Inicia sesión para pagar", description: "Te llevamos al login y retomamos tu publicación." });
      setTimeout(() => navigate("/auth?redirect=/dashboard/anunciante/publicar"), 400);
      return;
    }
    // Si ya hay sesión, abre el flujo de publicación
    setTimeout(() => openPublishFlowAfterVerify(), 250);
  };

  const canPublish = form.category && form.title && form.description && form.price && form.location && !!mainPhoto;

  // Decide qué modal abrir según el saldo disponible
  const openPublishFlowAfterVerify = () => {
    if (balanceCredits >= totalCredits) {
      // Tiene créditos: se publica directo y se descuenta (sin cuadro de pagos).
      doPublish();
    } else {
      // No tiene créditos: abre el configurador para comprar.
      setBuyCreditsOpen(true);
    }
  };

  const openPublishFlow = () => {
    if (!canPublish) {
      toast({ title: "Completa los datos requeridos", description: "Faltan campos obligatorios o imágenes.", variant: "destructive" });
      return;
    }
    if (!session) {
      persistDraftForLogin(true);
      toast({ title: "Inicia sesión para publicar", description: "Te llevamos al login y retomamos tu publicación." });
      navigate("/auth?redirect=/dashboard/anunciante/publicar");
      return;
    }
    openPublishFlowAfterVerify();
  };

  const doPublish = async () => {
    if (publishing) return;
    if (!session) {
      persistDraftForLogin(true);
      navigate("/auth?redirect=/dashboard/anunciante/publicar");
      return;
    }
    const email = userEmail || "anunciante@effe.pe";
    const tipoDoc = personType === "juridica" ? "ruc" : "dni";
    setPublishing(true);
    try {
      // 1) Crear el aviso y publicarlo
      const { listingId, invoiceNumber, published, invoiceSaved } = await createAndPublishListing({
        form,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        quantity,
        duration,
        extras,
        total,
        mainPhoto: mainPhoto ? { file: mainPhoto.file, name: mainPhoto.name } : null,
        secondPhoto: hasSecondImageInPackage && secondPhoto ? { file: secondPhoto.file, name: secondPhoto.name } : null,
        receiptType: "boleta",
        email,
        advertiserName: verifiedName || session?.name || "Anunciante",
        docType: tipoDoc,
        docNumber: docNumber || undefined,
      });

      // 2) Descontar créditos del saldo (según el costo del aviso)
      const spent = await spendCredits(totalCredits, listingId);
      const newBalance = await getCreditBalance();
      setCreditBalance(newBalance);
      if (!spent) {
        // El saldo cambió y ya no alcanza: abrir el configurador para comprar.
        toast({
          title: "No se pudieron descontar los créditos",
          description: "Tu saldo cambió y ya no alcanza. Compra créditos para completar.",
          variant: "destructive",
        });
        setBuyCreditsOpen(true);
      }

      // 3) Guardar comprobante local como respaldo
      const localInv = addInvoice({
        email,
        advertiser: verifiedName || session?.name || "Anunciante",
        listingTitle: form.title,
        amount: total,
        detail: `Boleta · Aviso ${duration} días · ${totalCredits} créditos (${formatSoles(total)})`,
        docNumber: docNumber || undefined,
        number: invoiceNumber || undefined,
      });

      setSuccessOpen({ open: true, number: invoiceNumber || localInv.number, email });
      if (!invoiceSaved) {
        toast({
          title: "Comprobante no registrado en la base de datos",
          description: "El aviso se publicó, pero el comprobante no se guardó en el servidor.",
          variant: "destructive",
        });
      }
      if (!published) {
        toast({
          title: "Comprobante guardado",
          description: "Tu boleta quedó registrada, pero el aviso quedó pendiente de activación. Nuestro equipo lo revisará.",
        });
      }
    } catch (e) {
      toast({
        title: "No se pudo publicar",
        description: e instanceof Error ? e.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };


  const completion = (() => {
    const fields = [form.category, form.title, form.description, form.price, form.location];
    const filled = fields.filter((v) => v && v.trim().length > 0).length;
    const total = fields.length + 1; // +1 fotos
    return Math.round(((filled + (mainPhoto ? 1 : 0)) / total) * 100);
  })();

  // Mientras se verifica la sesión (o se redirige al login) no mostramos el formulario.
  if (!authChecked) {
    return (
      <DashboardLayout role="anunciante">
        <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
          Verificando tu sesión…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="anunciante">
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-secondary mb-2">Nuevo aviso</p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">Publica con calidad profesional</h1>
            <p className="text-sm text-muted-foreground mt-1">Una buena ficha multiplica tus contactos.</p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2 min-w-[180px]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <span className="font-bold text-foreground">{completion}%</span> completado
            </div>
            <div className="w-full md:w-44 h-1.5 bg-muted overflow-hidden">
              <div className="h-full bg-secondary transition-all" style={{ width: `${completion}%` }} />
            </div>
            {verified && (
              <Badge variant="outline" className="text-success border-success/30 bg-success/10 gap-1">
                <ShieldCheck size={11} /> {personType === "natural" ? "DNI" : "RUC"} verificado
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Basics */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">01</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Tag size={16} className="text-secondary" /> Categoría y título</CardTitle>
                    <CardDescription className="text-xs">Clasifica tu aviso para que llegue al público correcto.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                <div>
                  <Label>Categoría *</Label>
                  <Select value={form.category} onValueChange={(v) => updateForm("category", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Título del aviso *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => updateForm("title", e.target.value)}
                    placeholder="Ej: Departamento 3 dormitorios en Miraflores"
                    maxLength={80}
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">{form.title.length}/80</p>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Photos — 2 slots por aviso */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">02</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Camera size={16} className="text-secondary" /> Imágenes del aviso</CardTitle>
                    <CardDescription className="text-xs">Cada aviso admite hasta 2 imágenes: la principal incluida y una segunda opcional.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Slot 1 — Principal */}
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { pickPhoto("main", e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="relative w-full aspect-[4/3] border-2 border-dashed border-border hover:border-secondary/60 hover:bg-muted/30 transition-colors flex items-center justify-center overflow-hidden bg-muted/20"
                  >
                    {mainPhoto ? (
                      <>
                        <img src={mainPhoto.url} alt="Principal" className="absolute inset-0 w-full h-full object-cover" />
                        <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-secondary text-secondary-foreground text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                          <Star size={10} className="fill-current" /> Portada
                        </span>
                        <span
                          role="button"
                          aria-label="Quitar imagen principal"
                          onClick={(e) => { e.stopPropagation(); setMainPhoto(null); }}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-white text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <X size={14} />
                        </span>
                      </>
                    ) : (
                      <div className="text-center px-4">
                        <ImagePlus size={28} className="mx-auto text-muted-foreground mb-2" />
                        <p className="text-xs font-semibold text-foreground">Imagen principal</p>
                        <p className="text-[11px] text-muted-foreground">Incluida · hasta 100 KB</p>
                      </div>
                    )}
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Imagen principal</span> — incluida sin costo, hasta 100 KB.
                  </p>
                </div>

                {/* Slot 2 — Segunda imagen (requiere adicional) */}
                <div>
                  <input
                    ref={secondFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { pickPhoto("second", e.target.files); if (secondFileRef.current) secondFileRef.current.value = ""; }}
                  />
                  <button
                    type="button"
                    onClick={() => hasSecondImageInPackage && secondFileRef.current?.click()}
                    disabled={!hasSecondImageInPackage}
                    className={`relative w-full aspect-[4/3] border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden ${
                      hasSecondImageInPackage
                        ? "border-border hover:border-secondary/60 hover:bg-muted/30 bg-muted/20"
                        : "border-border bg-muted/40 cursor-not-allowed opacity-80"
                    }`}
                  >
                    {hasSecondImageInPackage && secondPhoto ? (
                      <>
                        <img src={secondPhoto.url} alt="Segunda" className="absolute inset-0 w-full h-full object-cover" />
                        <span
                          role="button"
                          aria-label="Quitar segunda imagen"
                          onClick={(e) => { e.stopPropagation(); setSecondPhoto(null); }}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-white text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <X size={14} />
                        </span>
                      </>
                    ) : (
                      <div className="text-center px-4">
                        {hasSecondImageInPackage ? (
                          <>
                            <ImagePlus size={28} className="mx-auto text-muted-foreground mb-2" />
                            <p className="text-xs font-semibold text-foreground">Segunda imagen</p>
                            <p className="text-[11px] text-muted-foreground">Disponible · hasta 500 KB</p>
                          </>
                        ) : (
                          <>
                            <Lock size={24} className="mx-auto text-muted-foreground mb-2" />
                            <p className="text-xs font-semibold text-foreground">Segunda imagen</p>
                            <p className="text-[11px] text-muted-foreground">Hasta 500 KB</p>
                          </>
                        )}
                      </div>
                    )}
                  </button>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Segunda imagen (hasta 500 KB)</span> — incluida si compraste este adicional en tu paquete.
                  </p>
                  {!hasSecondImageInPackage && (
                    <p className="mt-1 text-[11px] text-warning">No tienes este adicional en tu paquete actual.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Step 3: Description */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">03</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><FileText size={16} className="text-secondary" /> Descripción</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <Textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  placeholder="Describe tu producto o servicio…"
                  className="min-h-[160px]"
                  maxLength={2000}
                />
                <p className="text-[11px] text-muted-foreground mt-1">{form.description.length}/2000</p>
              </CardContent>
            </Card>

            {/* Step 4: Price & location */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">04</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><MapPin size={16} className="text-secondary" /> Precio y ubicación</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <Label>Precio del producto *</Label>
                    <Input type="number" value={form.price} onChange={(e) => updateForm("price", e.target.value)} placeholder="0.00" className="mt-1" />
                  </div>
                  <div>
                    <Label>Moneda</Label>
                    <Select value={form.currency} onValueChange={(v) => updateForm("currency", v)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PEN">PEN (S/.)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <LocationPicker
                  location={form.location}
                  onLocationChange={(v) => updateForm("location", v)}
                  lat={coords?.lat ?? null}
                  lng={coords?.lng ?? null}
                  onCoordsChange={(la, ln) =>
                    setCoords(la != null && ln != null ? { lat: la, lng: ln } : null)
                  }
                  required
                />
                <div className="sm:w-1/2">
                  <Label>Condición</Label>
                  <Select value={form.condition} onValueChange={(v) => updateForm("condition", v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nuevo">Nuevo</SelectItem>
                      <SelectItem value="usado">Usado</SelectItem>
                      <SelectItem value="reacondicionado">Reacondicionado</SelectItem>
                      <SelectItem value="na">No aplica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Step 5: Paquete (cantidad + duración + adicionales) */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">05</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Package size={16} className="text-secondary" /> Duración y adicionales</CardTitle>
                    <CardDescription className="text-xs">Elige cuántos días durará tu aviso y qué extras quieres. El precio se calcula al instante.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-6">
                {/* Duración */}
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Duración del aviso</Label>
                  <div className="mt-2 grid grid-cols-3 md:grid-cols-6 gap-2">
                    {DURATIONS.map((d) => {
                      const p = priceForDuration(1, d, settings);
                      const active = duration === d;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDuration(d)}
                          className={`border p-3 text-center transition-all ${
                            active ? "border-secondary bg-secondary/10 ring-2 ring-secondary/30" : "border-border hover:border-secondary/40 hover:bg-muted/50"
                          }`}
                        >
                          <p className="text-lg font-extrabold text-foreground">{d}</p>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">días</p>
                          <p className="text-xs font-bold text-secondary mt-1">{formatSoles(p)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Adicionales opcionales */}
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Adicionales opcionales</Label>
                  <p className="text-[11px] text-muted-foreground mt-1 mb-2">
                    Actívalos con “+”. Se aplican a tu aviso.
                  </p>
                  <div className="space-y-2">
                    {EXTRA_DEFS.map(({ key, label, sub, icon: Icon }) => {
                      const count = extras[key] ?? 0;
                      const unit = settings.extras[key as keyof ExtraPrices] ?? 0;
                      return (
                        <div key={key} className={`flex items-center gap-3 p-3 border transition-all ${count > 0 ? "border-secondary bg-secondary/5" : "border-border"}`}>
                          <Icon size={16} className="text-secondary" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
                            {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
                          </div>
                          <span className="text-xs font-bold text-muted-foreground hidden sm:inline">{formatSoles(unit)} c/u</span>
                          <div className="flex items-center border">
                            <button type="button" onClick={() => setExtraCount(key, count - 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted disabled:opacity-30" disabled={count <= 0}>
                              <Minus size={12} />
                            </button>
                            <span className="w-8 text-center text-sm font-bold">{count}</span>
                            <button type="button" onClick={() => setExtraCount(key, count + 1)} className="w-8 h-8 flex items-center justify-center hover:bg-muted disabled:opacity-30" disabled={count >= quantity}>
                              <Plus size={12} />
                            </button>
                          </div>
                          <span className="text-xs font-bold text-foreground w-16 text-right">{formatSoles(count * unit)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Resumen del paquete (en créditos) */}
                <div className="border bg-muted/30 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Aviso ({duration} días)</span>
                    <span className="font-bold">{solesToCredits(packageBase)} cr</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Adicionales</span>
                    <span className="font-bold">{solesToCredits(extrasSum)} cr</span>
                  </div>
                  <div className="border-t pt-2 flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Total en créditos</span>
                    <span className="text-2xl font-extrabold text-primary">{totalCredits} cr</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Se descontará de tu saldo de créditos al publicar. (Boleta: {formatSoles(total)})
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: live total + actions.
              Sticky bajo el navbar (~76px) con scroll interno propio si supera el alto
              de pantalla, para que el botón "Publicar" siempre quede alcanzable. */}
          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-1">
            <Card className="border-secondary/40 border-2">
              <CardHeader className="border-b bg-secondary/5">
                <CardTitle className="text-sm uppercase tracking-widest text-secondary flex items-center gap-2">
                  <Wallet size={14} /> Costo en créditos
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Aviso · {duration} días</span>
                  <span className="font-bold">{solesToCredits(packageBase)} cr</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Adicionales</span>
                  <span className="font-bold">{solesToCredits(extrasSum)} cr</span>
                </div>
                {promoPct > 0 && (
                  <div className="flex justify-between text-sm text-success">
                    <span className="flex items-center gap-1">
                      <Percent size={12} /> Promo {activePromo?.name} (−{promoPct}%)
                    </span>
                    <span className="font-bold">−{baseCredits - totalCredits} cr</span>
                  </div>
                )}
                <div className="border-t pt-3 flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Total</span>
                  <span className="text-3xl font-extrabold text-primary">
                    {promoPct > 0 && (
                      <span className="text-sm font-normal text-muted-foreground line-through mr-2">{baseCredits}</span>
                    )}
                    {totalCredits} cr
                  </span>
                </div>
                <div className="border-t pt-3 flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Tu saldo</span>
                  {creditLoading ? (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  ) : (
                    <span className={`text-sm font-bold ${balanceCredits >= totalCredits ? "text-success" : "text-destructive"}`}>
                      {balanceCredits} cr
                    </span>
                  )}
                </div>
                {!creditLoading && balanceCredits < totalCredits && (
                  <p className="text-[11px] text-destructive">
                    Faltan {totalCredits - balanceCredits} créditos. Cómpralos al publicar.
                  </p>
                )}
                {!creditLoading && (
                  <div className="border-t pt-3 space-y-1">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
                      Con tu saldo puedes publicar
                    </p>
                    {avisosBreakdown(balanceCredits, settings).map(({ dias, count }) => (
                      <p key={dias} className="text-[11px] text-muted-foreground">
                        <span className="font-bold text-secondary">~{count} avisos</span> de {dias} días
                      </p>
                    ))}
                    <p className="text-[10px] text-muted-foreground pt-1">Sin adicionales; los extras suman al costo.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-sm uppercase tracking-widest text-secondary">Vista previa</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                  {mainPhoto ? (
                    <img src={mainPhoto.url} alt="Portada" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs uppercase tracking-widest">Sin imagen</div>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-secondary">
                    {categories.find((c) => c.id === form.category)?.name || "Categoría"}
                  </p>
                  <h3 className="font-semibold text-foreground line-clamp-2 min-h-[2.5rem]">{form.title || "Título de tu aviso"}</h3>
                  <p className="text-lg font-extrabold text-primary">
                    {form.price ? `${form.currency === "USD" ? "US$" : "S/"} ${Number(form.price).toLocaleString()}` : "S/ —"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin size={11} /> {form.location || "Ubicación"}</p>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button variant="hero" size="lg" className="w-full rounded-none" onClick={openPublishFlow}>
                Publicar aviso <ArrowRight size={16} className="ml-1" />
              </Button>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center text-center">
                <Wallet size={12} className="text-secondary" /> Se descontarán créditos de tu saldo al publicar.
              </p>
            </div>
          </div>
        </div>
      </div>



      {/* Popup verificación */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verifica tu identidad</DialogTitle>
            <DialogDescription>
              Antes de publicar, indícanos si publicas como persona natural o jurídica.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setPersonType("natural"); setDocNumber(""); setVerifiedName(""); }}
                className={`p-4 border text-left transition-all ${personType === "natural" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
              >
                <User size={20} className="text-secondary mb-2" />
                <p className="font-bold text-sm">Persona natural</p>
                <p className="text-[11px] text-muted-foreground">DNI · 8 dígitos</p>
              </button>
              <button
                type="button"
                onClick={() => { setPersonType("juridica"); setDocNumber(""); setVerifiedName(""); }}
                className={`p-4 border text-left transition-all ${personType === "juridica" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
              >
                <Building2 size={20} className="text-secondary mb-2" />
                <p className="font-bold text-sm">Persona jurídica</p>
                <p className="text-[11px] text-muted-foreground">RUC · 11 dígitos</p>
              </button>
            </div>
            {personType && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>{personType === "natural" ? "DNI" : "RUC"}</Label>
                  <Input
                    value={docNumber}
                    onChange={(e) => { setDocNumber(e.target.value.replace(/\D/g, "")); setVerifiedName(""); }}
                    maxLength={personType === "natural" ? 8 : 11}
                    placeholder={personType === "natural" ? "12345678" : "20123456789"}
                    className="mt-1"
                    disabled={verifying}
                  />
                </div>
                <Button onClick={handleVerify} disabled={verifying} className="gap-2">
                  <ShieldCheck size={14} /> {verifying ? "Verificando…" : "Verificar"}
                </Button>
              </div>
            )}
            {verifiedName && (
              <p className="text-xs text-success flex items-center gap-1.5">
                <ShieldCheck size={13} /> {verifiedName}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVerifyOpen(false)}>Más tarde</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal compra de créditos — configurador (cuando no hay saldo suficiente) */}
      <BuyCreditsModal
        open={buyCreditsOpen}
        onClose={() => setBuyCreditsOpen(false)}
        creditCost={totalCredits}
        currentBalance={balanceCredits}
        onPurchaseComplete={(newBalance) => {
          setCreditBalance(newBalance);
          setBuyCreditsOpen(false);
          // Tras comprar, si ya alcanza, se publica de inmediato y se descuenta.
          if (Math.round(newBalance) >= totalCredits) {
            doPublish();
          } else {
            toast({
              title: "Créditos añadidos",
              description: `Tu saldo es ${Math.round(newBalance)} cr, pero este aviso cuesta ${totalCredits} cr. Compra un poco más para publicar.`,
            });
          }
        }}
      />

      {/* Confirmación post-pago */}
      <Dialog open={successOpen.open} onOpenChange={(o) => setSuccessOpen((s) => ({ ...s, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="text-success" size={20} /> ¡Pago confirmado!
            </DialogTitle>
            <DialogDescription>
              Tu aviso ha sido publicado correctamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="p-3 border bg-muted/30 space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Boleta electrónica</p>
              <p className="font-mono font-bold">{successOpen.number}</p>
              <p className="text-xs text-muted-foreground">Enviado a <span className="font-semibold text-foreground">{successOpen.email}</span></p>
            </div>
            <p className="text-xs text-muted-foreground">
              También puedes verlo en <span className="font-semibold text-foreground">Mis comprobantes</span>.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setSuccessOpen({ open: false, number: "", email: "" }); navigate("/dashboard/anunciante/boletas"); }}>
              Ver mis comprobantes
            </Button>
            <Button onClick={() => { setSuccessOpen({ open: false, number: "", email: "" }); navigate("/dashboard/anunciante/avisos"); }}>
              Ir a mis avisos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default AdvertiserPublish;
