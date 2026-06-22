import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ImagePlus, X, ArrowLeft, ArrowRight, Star, Check, MapPin, Tag, FileText, Camera,
  ShieldCheck, Building2, User, CreditCard, Receipt, Sparkles, Flame, EyeOff, Lock, Package, Minus, Plus,
} from "lucide-react";
import { categories } from "@/data/mockData";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { toast } from "@/hooks/use-toast";
import {
  loadSettings, priceForDuration, formatSoles, addInvoice,
  type DurationDays, type PricingSettings, type ExtraPrices,
} from "@/lib/pricing";

interface PhotoItem { id: string; url: string; name: string; }

const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];
const QUANTITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

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

  // Verificación de identidad (se solicita al presionar "Publicar aviso")
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [personType, setPersonType] = useState<"natural" | "juridica" | "">("");
  const [docNumber, setDocNumber] = useState("");
  const [verified, setVerified] = useState(false);

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

  // Paquete: cantidad, duración, extras (cantidad por tipo)
  const [quantity, setQuantity] = useState<number>(1);
  const [duration, setDuration] = useState<DurationDays>(7);
  const [extras, setExtras] = useState<ExtrasCount>({});

  // Resumen y pago
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [receiptType, setReceiptType] = useState<"boleta" | "factura">("boleta");
  const [receiptEmail, setReceiptEmail] = useState("");
  const [successOpen, setSuccessOpen] = useState<{ open: boolean; number: string; email: string }>({ open: false, number: "", email: "" });

  // Pricing en vivo
  const [settings, setSettings] = useState<PricingSettings>(() => loadSettings());
  useEffect(() => {
    const sync = () => setSettings(loadSettings());
    window.addEventListener("effe:pricing-updated", sync);
    return () => window.removeEventListener("effe:pricing-updated", sync);
  }, []);

  // Restaurar borrador y reanudar flujo tras login
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.form) setForm(d.form);
      if (d.duration) setDuration(d.duration);
      if (d.quantity) setQuantity(d.quantity);
      if (d.extras) setExtras(d.extras);
      if (d.verified) setVerified(d.verified);
      if (d.personType) setPersonType(d.personType);
      if (d.docNumber) setDocNumber(d.docNumber);
      if (d.resumeAtSummary && session) {
        setTimeout(() => setSummaryOpen(true), 200);
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
  const total = Math.round((packageBase + extrasSum) * 100) / 100;
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
        form, duration, quantity, extras, verified: true, personType, docNumber, resumeAtSummary,
      }));
    } catch { /* noop */ }
  };

  const handleVerify = () => {
    if (personType === "natural" && docNumber.length !== 8) {
      toast({ title: "DNI inválido", description: "El DNI debe tener 8 dígitos.", variant: "destructive" });
      return;
    }
    if (personType === "juridica" && docNumber.length !== 11) {
      toast({ title: "RUC inválido", description: "El RUC debe tener 11 dígitos.", variant: "destructive" });
      return;
    }
    setVerified(true);
    setVerifyOpen(false);
    toast({ title: "Identidad verificada", description: `${personType === "natural" ? "DNI" : "RUC"} ${docNumber} confirmado.` });

    // Tras verificar exige login antes del pago
    if (!session) {
      persistDraftForLogin(true);
      toast({ title: "Inicia sesión para pagar", description: "Te llevamos al login y retomamos tu publicación." });
      setTimeout(() => navigate("/auth?redirect=/dashboard/anunciante/publicar"), 400);
      return;
    }
    // Si ya hay sesión, abre el resumen directamente
    setConfirmed(false);
    setTimeout(() => setSummaryOpen(true), 250);
  };

  const canPublish = form.category && form.title && form.description && form.price && form.location && !!mainPhoto;

  const openSummary = () => {
    if (!canPublish) {
      toast({ title: "Completa los datos requeridos", description: "Faltan campos obligatorios o imágenes.", variant: "destructive" });
      return;
    }
    // Paso 1: verificar identidad (sin requerir login todavía)
    if (!verified) {
      setVerifyOpen(true);
      return;
    }
    // Paso 2: si no hay sesión, exigir login antes de mostrar el pago
    if (!session) {
      persistDraftForLogin(true);
      toast({ title: "Inicia sesión para pagar", description: "Te llevamos al login y retomamos tu publicación." });
      navigate("/auth?redirect=/dashboard/anunciante/publicar");
      return;
    }
    // Paso 3: resumen y pago
    setConfirmed(false);
    setSummaryOpen(true);
  };

  const confirmAndPay = () => {
    if (!confirmed) return;
    if (!session) {
      persistDraftForLogin(true);
      navigate("/auth?redirect=/dashboard/anunciante/publicar");
      return;
    }
    const email = receiptEmail.trim() || "anunciante@effe.pe";
    const inv = addInvoice({
      email,
      advertiser: session?.name || "Anunciante",
      listingTitle: form.title,
      amount: total,
      detail: `${receiptType === "factura" ? "Factura" : "Boleta"} · Aviso ${duration} días · ${Object.keys(extras).filter((k) => (extras as Record<string, boolean>)[k]).join(", ") || "sin extras"}`,
    });
    setSummaryOpen(false);
    setSuccessOpen({ open: true, number: inv.number, email });
  };


  const completion = (() => {
    const fields = [form.category, form.title, form.description, form.price, form.location];
    const filled = fields.filter((v) => v && v.trim().length > 0).length;
    const total = fields.length + 1; // +1 fotos
    return Math.round(((filled + (mainPhoto ? 1 : 0)) / total) * 100);
  })();

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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Ubicación *</Label>
                    <Input value={form.location} onChange={(e) => updateForm("location", e.target.value)} placeholder="Ej: Lima, Miraflores" className="mt-1" />
                  </div>
                  <div>
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
                </div>
              </CardContent>
            </Card>

            {/* Step 5: Paquete (cantidad + duración + adicionales) */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">05</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Package size={16} className="text-secondary" /> ¿Cuántos avisos quieres publicar?</CardTitle>
                    <CardDescription className="text-xs">Configura tu paquete antes de pasar al pago.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-6">
                {/* Cantidad */}
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Cantidad de avisos</Label>
                  <div className="mt-2 grid grid-cols-5 sm:grid-cols-10 gap-2">
                    {QUANTITIES.map((n) => {
                      const active = quantity === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setQuantity(n)}
                          className={`border py-2 text-center text-sm font-bold transition-all ${
                            active ? "border-secondary bg-secondary/10 ring-2 ring-secondary/30 text-foreground" : "border-border hover:border-secondary/40 hover:bg-muted/50"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Duración */}
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Duración por aviso</Label>
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
                    Hasta {quantity} unidades por adicional (uno por aviso del paquete).
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

                {/* Resumen del paquete */}
                <div className="border bg-muted/30 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal por {quantity} aviso{quantity > 1 ? "s" : ""} ({duration} días c/u)</span>
                    <span className="font-bold">{formatSoles(packageBase)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal por adicionales</span>
                    <span className="font-bold">{formatSoles(extrasSum)}</span>
                  </div>
                  <div className="border-t pt-2 flex items-baseline justify-between">
                    <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Total a pagar (IGV incl.)</span>
                    <span className="text-2xl font-extrabold text-primary">{formatSoles(total)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    El paquete que estás comprando es una referencia. Podrás distribuir tus adicionales libremente entre tus avisos según tu saldo disponible.
                  </p>
                  {quantity > 1 && (
                    <p className="text-[11px] text-muted-foreground">
                      Tus avisos restantes quedarán disponibles en tu saldo para publicar durante el período de vigencia del paquete.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: live total + actions */}
          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card className="border-secondary/40 border-2">
              <CardHeader className="border-b bg-secondary/5">
                <CardTitle className="text-sm uppercase tracking-widest text-secondary flex items-center gap-2">
                  <CreditCard size={14} /> Precio del aviso
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{quantity} aviso{quantity > 1 ? "s" : ""} × {duration} días</span>
                  <span className="font-bold">{formatSoles(packageBase)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Adicionales</span>
                  <span className="font-bold">{formatSoles(extrasSum)}</span>
                </div>
                <div className="border-t pt-3 flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Total (IGV incl.)</span>
                  <span className="text-3xl font-extrabold text-primary">{formatSoles(total)}</span>
                </div>
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
              <Button variant="hero" size="lg" className="w-full rounded-none" onClick={openSummary}>
                Publicar aviso <ArrowRight size={16} className="ml-1" />
              </Button>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center text-center">
                <ShieldCheck size={12} className="text-secondary" /> Al publicar verificarás tu identidad y luego confirmarás el pago.
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
                onClick={() => { setPersonType("natural"); setDocNumber(""); }}
                className={`p-4 border text-left transition-all ${personType === "natural" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
              >
                <User size={20} className="text-secondary mb-2" />
                <p className="font-bold text-sm">Persona natural</p>
                <p className="text-[11px] text-muted-foreground">DNI · 8 dígitos</p>
              </button>
              <button
                type="button"
                onClick={() => { setPersonType("juridica"); setDocNumber(""); }}
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
                    onChange={(e) => setDocNumber(e.target.value.replace(/\D/g, ""))}
                    maxLength={personType === "natural" ? 8 : 11}
                    placeholder={personType === "natural" ? "12345678" : "20123456789"}
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleVerify} className="gap-2"><ShieldCheck size={14} /> Verificar</Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVerifyOpen(false)}>Más tarde</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Popup resumen + pago */}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resumen de tu aviso</DialogTitle>
            <DialogDescription>Revisa los datos antes de confirmar el pago.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-3 p-3 border bg-muted/30">
              {photos[0] && <img src={photos[0].url} alt="" className="w-20 h-20 object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest font-bold text-secondary">
                  {categories.find((c) => c.id === form.category)?.name}
                </p>
                <p className="font-bold text-sm line-clamp-2">{form.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin size={10} /> {form.location}
                </p>
                <p className="text-sm font-extrabold text-primary mt-1">
                  {form.currency === "USD" ? "US$" : "S/"} {Number(form.price).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duración</span>
                <span className="font-bold">{duration} días</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Publicación</span>
                <span>{formatSoles(basePrice)}</span>
              </div>
              {Object.entries(extras).filter(([, v]) => v).map(([k]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-muted-foreground capitalize">+ {k}</span>
                  <span>{formatSoles(settings.extras[k as keyof typeof settings.extras])}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between items-baseline">
                <span className="font-bold uppercase tracking-wider text-xs">Total (IGV incl.)</span>
                <span className="text-2xl font-extrabold text-primary">{formatSoles(total)}</span>
              </div>
            </div>

            {/* Tipo de comprobante */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Tipo de comprobante</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReceiptType("boleta")}
                  className={`p-3 border text-left transition-all ${receiptType === "boleta" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
                >
                  <p className="font-bold text-sm">Boleta</p>
                  <p className="text-[11px] text-muted-foreground">Persona natural</p>
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptType("factura")}
                  className={`p-3 border text-left transition-all ${receiptType === "factura" ? "border-secondary bg-secondary/10" : "border-border hover:bg-muted/50"}`}
                >
                  <p className="font-bold text-sm">Factura</p>
                  <p className="text-[11px] text-muted-foreground">Empresa con RUC</p>
                </button>
              </div>
              <div>
                <Label className="text-xs">Correo para enviar el comprobante</Label>
                <Input
                  type="email"
                  value={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="mt-1"
                />
              </div>
            </div>

            <label className="flex items-start gap-2 p-3 border bg-secondary/5 cursor-pointer">
              <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} className="mt-0.5" />
              <span className="text-xs">
                Confirmo que la información del aviso es correcta y autorizo la publicación inmediata tras el pago.
              </span>
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSummaryOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAndPay} disabled={!confirmed} className="gap-2">
              <CreditCard size={14} /> Pagar {formatSoles(total)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{receiptType === "factura" ? "Factura" : "Boleta"} electrónica</p>
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
