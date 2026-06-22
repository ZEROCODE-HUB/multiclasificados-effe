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
  ShieldCheck, Building2, User, CreditCard, Receipt, Sparkles, Flame, EyeOff,
} from "lucide-react";
import { categories } from "@/data/mockData";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { toast } from "@/hooks/use-toast";
import {
  loadSettings, totalPrice, priceForDuration, extrasTotal, formatSoles, addInvoice,
  type ExtrasSelection, type DurationDays, type PricingSettings,
} from "@/lib/pricing";

interface PhotoItem { id: string; url: string; name: string; }

const MAX_PHOTOS = 10;
const DURATIONS: DurationDays[] = [3, 7, 15, 30, 60, 90];

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

  // Datos del aviso
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: "",
    title: "",
    description: "",
    price: "",
    currency: "PEN",
    location: "",
    condition: "nuevo",
  });
  const [duration, setDuration] = useState<DurationDays>(7);
  const [extras, setExtras] = useState<ExtrasSelection>({});

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
      if (d.extras) setExtras(d.extras);
      if (d.verified) setVerified(d.verified);
      if (d.personType) setPersonType(d.personType);
      if (d.docNumber) setDocNumber(d.docNumber);
      // Si el usuario regresa autenticado y ya estaba verificado, retomar en el resumen
      if (d.resumeAtSummary && session) {
        setTimeout(() => setSummaryOpen(true), 200);
      }
      localStorage.removeItem(DRAFT_KEY);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const basePrice = priceForDuration(1, duration, settings);
  const extrasSum = extrasTotal(extras, settings);
  const total = totalPrice(1, duration, extras, settings);

  const updateForm = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    const mapped: PhotoItem[] = incoming.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: URL.createObjectURL(f),
      name: f.name,
    }));
    setPhotos((p) => [...p, ...mapped]);
  };

  const removePhoto = (id: string) => setPhotos((p) => p.filter((x) => x.id !== id));
  const setCover = (id: string) =>
    setPhotos((p) => {
      const found = p.find((x) => x.id === id);
      if (!found) return p;
      return [found, ...p.filter((x) => x.id !== id)];
    });

  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setPhotos((prev) => {
      const from = prev.findIndex((p) => p.id === dragId);
      const to = prev.findIndex((p) => p.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const onDragEnd = () => setDragId(null);

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
    toast({ title: "Identidad verificada", description: `${personType === "natural" ? "DNI" : "RUC"} ${docNumber} confirmado. Continúa con el pago.` });
    // Tras verificar, abre directamente el resumen y pago
    setConfirmed(false);
    setTimeout(() => setSummaryOpen(true), 250);
  };

  const canPublish = form.category && form.title && form.description && form.price && form.location && photos.length > 0;

  const openSummary = () => {
    if (!session) {
      toast({ title: "Inicia sesión para continuar", description: "Necesitas una cuenta para publicar." });
      navigate("/auth?redirect=/dashboard/anunciante/publicar");
      return;
    }
    if (!canPublish) {
      toast({ title: "Completa los datos requeridos", description: "Faltan campos obligatorios o imágenes.", variant: "destructive" });
      return;
    }
    // Paso 1: verificar identidad si aún no se ha hecho
    if (!verified) {
      setVerifyOpen(true);
      return;
    }
    // Paso 2: resumen y pago
    setConfirmed(false);
    setSummaryOpen(true);
  };

  const confirmAndPay = () => {
    if (!confirmed) return;
    const inv = addInvoice({
      email: "anunciante@effe.pe",
      advertiser: session?.name || "Anunciante",
      listingTitle: form.title,
      amount: total,
      detail: `Aviso ${duration} días · ${Object.keys(extras).filter((k) => (extras as Record<string, boolean>)[k]).join(", ") || "sin extras"}`,
    });
    setSummaryOpen(false);
    toast({
      title: "¡Aviso publicado!",
      description: `Boleta ${inv.number} enviada a ${inv.email}.`,
    });
    setTimeout(() => navigate("/dashboard/anunciante/avisos"), 800);
  };

  const completion = (() => {
    const fields = [form.category, form.title, form.description, form.price, form.location];
    const filled = fields.filter((v) => v && v.trim().length > 0).length;
    const total = fields.length + 1; // +1 fotos
    return Math.round(((filled + (photos.length > 0 ? 1 : 0)) / total) * 100);
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

            {/* Step 2: Photos */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">02</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Camera size={16} className="text-secondary" /> Imágenes ({photos.length}/{MAX_PHOTOS})</CardTitle>
                    <CardDescription className="text-xs">Sube hasta 10 fotos. Arrastra para reordenar.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }}
                />
                {photos.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                    className="w-full border-2 border-dashed border-border p-10 text-center hover:border-secondary/60 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <ImagePlus size={36} className="mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm font-semibold text-foreground">Arrastra tus fotos o haz clic para seleccionar</p>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG o WEBP</p>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {photos.map((p, i) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => onDragStart(p.id)}
                        onDragOver={(e) => onDragOver(e, p.id)}
                        onDragEnd={onDragEnd}
                        className={`relative group aspect-square overflow-hidden border bg-muted cursor-move ${dragId === p.id ? "ring-2 ring-secondary opacity-70" : "border-border"}`}
                      >
                        <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                        <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-bold">{i + 1}</div>
                        {i === 0 && (
                          <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 px-1.5 py-1 bg-secondary text-secondary-foreground text-[10px] font-extrabold uppercase tracking-wider">
                            <Star size={10} className="fill-current" /> Portada
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                          {i !== 0 && (
                            <button type="button" onClick={() => setCover(p.id)} title="Portada" className="w-7 h-7 bg-white text-foreground flex items-center justify-center hover:bg-secondary hover:text-secondary-foreground">
                              <Star size={13} />
                            </button>
                          )}
                          <button type="button" onClick={() => removePhoto(p.id)} title="Eliminar" className="w-7 h-7 bg-white text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground">
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="aspect-square border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-secondary/60 hover:text-secondary hover:bg-muted/30 transition-colors">
                        <ImagePlus size={22} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider">Añadir</span>
                      </button>
                    )}
                  </div>
                )}
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

            {/* Step 5: Duración */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">05</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Receipt size={16} className="text-secondary" /> Duración del aviso</CardTitle>
                    <CardDescription className="text-xs">El precio cambia automáticamente según la duración.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {DURATIONS.map((d) => {
                    const p = priceForDuration(1, d, settings);
                    const active = duration === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDuration(d)}
                        className={`border p-3 text-center transition-all ${
                          active
                            ? "border-secondary bg-secondary/10 ring-2 ring-secondary/30"
                            : "border-border hover:border-secondary/40 hover:bg-muted/50"
                        }`}
                      >
                        <p className="text-lg font-extrabold text-foreground">{d}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">días</p>
                        <p className="text-xs font-bold text-secondary mt-1">{formatSoles(p)}</p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Step 6: Extras */}
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-primary text-primary-foreground text-xs font-extrabold flex items-center justify-center">06</span>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Sparkles size={16} className="text-secondary" /> Extras opcionales</CardTitle>
                    <CardDescription className="text-xs">Mejora la visibilidad de tu aviso.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { key: "img100", label: "Imagen adicional 100kb", icon: ImagePlus },
                  { key: "img500", label: "Imagen adicional 500kb", icon: ImagePlus },
                  { key: "pdf100", label: "PDF adjunto 100kb", icon: FileText },
                  { key: "pdf500", label: "PDF adjunto 500kb", icon: FileText },
                  { key: "urgente", label: "Marcar como Urgente", icon: Flame },
                  { key: "destacado", label: "Marcar como Destacado", icon: Star },
                  { key: "confidencial", label: "Marcar como Confidencial", icon: EyeOff },
                ] as const).map(({ key, label, icon: Icon }) => {
                  const checked = !!extras[key];
                  return (
                    <label key={key} className={`flex items-center gap-3 p-3 border cursor-pointer transition-all ${checked ? "border-secondary bg-secondary/5" : "border-border hover:bg-muted/30"}`}>
                      <Checkbox checked={checked} onCheckedChange={(v) => setExtras((e) => ({ ...e, [key]: !!v }))} />
                      <Icon size={16} className="text-secondary" />
                      <span className="flex-1 text-sm font-medium">{label}</span>
                      <span className="text-xs font-bold text-foreground">+ {formatSoles(settings.extras[key])}</span>
                    </label>
                  );
                })}
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
                  <span className="text-muted-foreground">Publicación ({duration} días)</span>
                  <span className="font-bold">{formatSoles(basePrice)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Extras</span>
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
                  {photos[0] ? (
                    <img src={photos[0].url} alt="Portada" className="w-full h-full object-cover" />
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
    </DashboardLayout>
  );
};

export default AdvertiserPublish;
