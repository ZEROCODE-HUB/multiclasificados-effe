import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, X, ArrowLeft, ArrowRight, Star, Check, MapPin, Tag, FileText, Camera, ShieldCheck } from "lucide-react";
import { categories } from "@/data/mockData";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { toast } from "@/hooks/use-toast";

interface PhotoItem {
  id: string;
  url: string;
  name: string;
}

const MAX_PHOTOS = 10;

const AdvertiserPublish = () => {
  const session = useSession();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
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

  const completion = (() => {
    const fields = [form.category, form.title, form.description, form.price, form.location];
    const filled = fields.filter((v) => v && v.trim().length > 0).length;
    const total = fields.length + 1; // +1 photos
    return Math.round(((filled + (photos.length > 0 ? 1 : 0)) / total) * 100);
  })();

  const canPublish = form.category && form.title && form.description && form.price && form.location && photos.length > 0;

  const handlePublish = () => {
    if (!canPublish) {
      toast({ title: "Completa los datos requeridos", description: "Faltan campos obligatorios o imágenes.", variant: "destructive" });
      return;
    }
    if (!session) {
      toast({ title: "Inicia sesión para continuar", description: "Necesitas una cuenta para publicar tu aviso." });
      navigate("/auth?redirect=/planes?from=publicar");
      return;
    }
    navigate("/planes?from=publicar");
  };

  const handleDraft = () => {
    toast({ title: "Borrador guardado", description: "Podrás continuar más tarde desde Mis avisos." });
  };

  return (
    <DashboardLayout role="anunciante">
      <div className="animate-fade-in">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-secondary mb-2">Nuevo aviso</p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">Publica con calidad profesional</h1>
            <p className="text-sm text-muted-foreground mt-1">Una buena ficha multiplica tus contactos. Te tomará menos de 3 minutos.</p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2 min-w-[180px]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
              <span className="font-bold text-foreground">{completion}%</span> completado
            </div>
            <div className="w-full md:w-44 h-1.5 bg-muted overflow-hidden">
              <div className="h-full bg-secondary transition-all" style={{ width: `${completion}%` }} />
            </div>
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
                  <p className="text-[11px] text-muted-foreground mt-1">{form.title.length}/80 · Usa palabras clave que tu comprador buscaría.</p>
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
                    <CardDescription className="text-xs">Sube hasta 10 fotos. Arrastra para reordenar. La primera será la portada.</CardDescription>
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
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG o WEBP · Máx. 5 MB cada una</p>
                  </button>
                ) : (
                  <>
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
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] font-bold">
                            {i + 1}
                          </div>
                          {i === 0 && (
                            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 px-1.5 py-1 bg-secondary text-secondary-foreground text-[10px] font-extrabold uppercase tracking-wider">
                              <Star size={10} className="fill-current" /> Portada
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                            {i !== 0 && (
                              <button
                                type="button"
                                onClick={() => setCover(p.id)}
                                title="Marcar como portada"
                                className="w-7 h-7 bg-white text-foreground flex items-center justify-center hover:bg-secondary hover:text-secondary-foreground"
                              >
                                <Star size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removePhoto(p.id)}
                              title="Eliminar"
                              className="w-7 h-7 bg-white text-destructive flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {photos.length < MAX_PHOTOS && (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()}
                          className="aspect-square border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-secondary/60 hover:text-secondary hover:bg-muted/30 transition-colors"
                        >
                          <ImagePlus size={22} />
                          <span className="text-[11px] font-semibold uppercase tracking-wider">Añadir</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <ArrowLeft size={12} /> Arrastra <ArrowRight size={12} /> para reordenar. Click en
                      <Star size={11} className="inline text-secondary" /> para fijar portada.
                    </p>
                  </>
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
                    <CardDescription className="text-xs">Detalla características, beneficios y condiciones.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                <Textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  placeholder="Describe tu producto o servicio: características, estado, beneficios, garantía..."
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
                    <CardDescription className="text-xs">Datos clave para que los buscadores tomen decisión.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <Label>Precio *</Label>
                    <Input
                      type="number"
                      value={form.price}
                      onChange={(e) => updateForm("price", e.target.value)}
                      placeholder="0.00"
                      className="mt-1"
                    />
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
                    <Input
                      value={form.location}
                      onChange={(e) => updateForm("location", e.target.value)}
                      placeholder="Ej: Lima, Miraflores"
                      className="mt-1"
                    />
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
          </div>

          {/* Sidebar: live preview + tips + actions */}
          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-sm uppercase tracking-widest text-secondary">Vista previa</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                  {photos[0] ? (
                    <img src={photos[0].url} alt="Portada" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs uppercase tracking-widest">
                      Sin imagen
                    </div>
                  )}
                  {photos.length > 1 && (
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-1">
                      +{photos.length - 1} fotos
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-secondary">
                    {categories.find((c) => c.id === form.category)?.name || "Categoría"}
                  </p>
                  <h3 className="font-semibold text-foreground line-clamp-2 min-h-[2.5rem]">
                    {form.title || "Título de tu aviso"}
                  </h3>
                  <p className="text-lg font-extrabold text-primary">
                    {form.price ? `${form.currency === "USD" ? "US$" : "S/"} ${Number(form.price).toLocaleString()}` : "S/ —"}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin size={11} /> {form.location || "Ubicación"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-xs uppercase tracking-widest font-bold text-secondary">Consejos pro</p>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2"><Check size={14} className="text-secondary mt-0.5" /> Sube al menos 5 fotos en alta resolución.</li>
                  <li className="flex items-start gap-2"><Check size={14} className="text-secondary mt-0.5" /> Usa un título descriptivo con palabras clave.</li>
                  <li className="flex items-start gap-2"><Check size={14} className="text-secondary mt-0.5" /> Incluye precio real y ubicación específica.</li>
                </ul>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              <Button variant="hero" size="lg" className="w-full rounded-none" onClick={handlePublish}>
                Publicar aviso <ArrowRight size={16} className="ml-1" />
              </Button>
              <Button variant="outline" size="lg" className="w-full rounded-none" onClick={handleDraft}>
                Guardar borrador
              </Button>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 justify-center">
                <ShieldCheck size={12} className="text-secondary" /> Al publicar, eliges tu plan de visibilidad.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AdvertiserPublish;
