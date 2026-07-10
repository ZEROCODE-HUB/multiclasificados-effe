import { useParams, Link, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Listing } from "@/data/mockData";
import { useCategories } from "@/hooks/useCategories";
import { fetchListingById, fetchListingImages, fetchListings, fetchListingDocumentUrl, trackEvent } from "@/lib/listings";
import {
  ChevronRight,
  MapPin,
  Heart,
  Share2,
  Flag,
  ShieldCheck,
  Star,
  Eye,
  Calendar,
  Phone,
  MessageSquare,
  CheckCircle2,
  ChevronLeft,
  Tag,
  Award,
  Flame,
  EyeOff,
  Clock,
  Building2,
  Users,
  Copy,
  MessageCircle,
  Link2,
  Send,
  ClipboardCheck,
  FileText,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/useSession";
import { useFavorites } from "@/hooks/useFavorites";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { ListingReviews } from "@/components/ListingReviews";
import { ListingLocationMap } from "@/components/ListingLocationMap";
import { fetchSellerInfo, fetchReviews } from "@/lib/reviews";
import { applyToListing, fetchMyApplication, STATUS_LABEL, type ApplicationStatus } from "@/lib/applications";
import { Checkbox } from "@/components/ui/checkbox";
import { loadSold, markSold } from "@/lib/pricing";
import { reportListing, reportUser, LISTING_REPORT_REASONS, USER_REPORT_REASONS } from "@/lib/reports";
import { shareListingWhatsApp, copyListingLink, shareListingSystem, canSystemShare } from "@/lib/share";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { getOrCreateConversation, sendMessage } from "@/lib/messaging";


export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const categories = useCategories();
  // Placeholder neutro hasta cargar el aviso real (sin datos ficticios).
  const EMPTY: Listing = {
    id: id ?? "", title: "", description: "", price: 0, currency: "PEN",
    category: "", location: "", imageUrl: "", date: new Date().toISOString(),
    featured: false, advertiser: "", views: 0,
  };
  const [listing, setListing] = useState<Listing>(EMPTY);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [related, setRelated] = useState<Listing[]>([]);
  const session = useSession();
  const { isFavorite, toggle } = useFavorites();
  // En el APK, reserva el alto del teclado y centra el campo enfocado en los
  // diálogos con texto (mensaje, postulación, reportes).
  const { kbPad, scrollFocusedIntoView } = useKeyboardInset();
  const fav = isFavorite(listing.id);

  // Reseñas (rating real del vendedor) + postulación del usuario
  const [sellerRating, setSellerRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [myApp, setMyApp] = useState<ApplicationStatus | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyMsg, setApplyMsg] = useState("");
  const [applyCv, setApplyCv] = useState<File | null>(null);
  const [applying, setApplying] = useState(false);

  const closeApply = () => {
    setApplyOpen(false);
    setApplyMsg("");
    setApplyCv(null);
  };

  const onPickCv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.type !== "application/pdf") {
      toast({ title: "Formato no válido", description: "El CV debe ser un PDF.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      toast({ title: "Archivo muy grande", description: "El PDF no puede superar los 5 MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    setApplyCv(file);
  };
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Guardia: el detalle del aviso solo es visible con sesión iniciada.
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        navigate(`/auth?redirect=/aviso/${id ?? ""}`, { replace: true });
      } else {
        setAuthChecked(true);
      }
    });
    return () => { active = false; };
  }, [id, navigate]);

  const loadReviewMeta = () => {
    if (!id) return;
    fetchSellerInfo(id).then((info) => {
      if (!info) return;
      setSellerRating(info.rating);
      setOwnerId(info.ownerId);
    });
    fetchReviews(id).then((rs) => setReviewCount(rs.length));
  };

  // Al cambiar de aviso (p. ej. desde "Sigue explorando"), vuelve al inicio de
  // la página para mostrar el encabezado del nuevo aviso y no quedarse abajo.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    fetchListingById(id).then((l) => {
      if (mounted && l) setListing(l);
    });
    fetchListingDocumentUrl(id).then((url) => mounted && setDocUrl(url));
    fetchListings({ limit: 8 }).then((rows) => {
      if (mounted) setRelated(rows.filter((l) => l.id !== id).slice(0, 4));
    });
    loadReviewMeta();
    fetchMyApplication(id).then((s) => mounted && setMyApp(s));
    supabase.auth.getUser().then(({ data }) => mounted && setCurrentUserId(data.user?.id ?? null));
    trackEvent(id, "view"); // REQ-08: registra la visita
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session]);
  const category = categories.find((c) => c.id === listing.category);
  // Las postulaciones (y las reseñas que dependen de ellas) solo aplican a empleos.
  const isJobs = listing.category === "empleos";
  // El dueño del aviso no puede postularse ni reseñar su propia publicación.
  const isOwner = !!currentUserId && !!ownerId && currentUserId === ownerId;

  // Imágenes de demo (solo para avisos mock, no para avisos reales).
  const MOCK_EXTRA_IMAGES = [
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&h=800&fit=crop",
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&h=800&fit=crop",
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&h=800&fit=crop",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&h=800&fit=crop",
  ];
  const isRealId = !!id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const [gallery, setGallery] = useState<string[]>([listing.imageUrl]);
  const [activeImg, setActiveImg] = useState(0);

  // Carga las imágenes REALES del aviso; cae a demo solo si es un aviso mock.
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    fetchListingImages(id).then((urls) => {
      if (!mounted) return;
      if (urls.length) setGallery(urls);
      else if (!isRealId) setGallery([listing.imageUrl, ...MOCK_EXTRA_IMAGES]);
      else setGallery([listing.imageUrl]);
      setActiveImg(0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, listing.imageUrl]);

  // Sin teléfono público (se coordina por mensaje).
  const phoneNumber = "No disponible";

  const [messageOpen, setMessageOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("");
  const [reportDetail, setReportDetail] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  // Reporte de usuario (anunciante)
  const [userReportOpen, setUserReportOpen] = useState(false);
  const [userReportCategory, setUserReportCategory] = useState("");
  const [userReportDetail, setUserReportDetail] = useState("");
  const [userReportSubmitting, setUserReportSubmitting] = useState(false);
  const [soldState, setSoldState] = useState(() => loadSold()[listing.id]);

  const [messageText, setMessageText] = useState(
    `Hola ${listing.advertiser.split(" ")[0]}, estoy interesado en "${listing.title}". ¿Sigue disponible?`,
  );

  const handleReport = async () => {
    if (!reportCategory || !listing.id) return;
    setReportSubmitting(true);
    try {
      await reportListing(listing.id, reportCategory, reportDetail);
      setReportOpen(false);
      setReportCategory("");
      setReportDetail("");
      toast({ title: "Reporte enviado", description: "Nuestro equipo de moderación revisará el aviso." });
    } catch (e) {
      toast({ title: "No se pudo reportar", description: e instanceof Error ? e.message : "Intenta de nuevo.", variant: "destructive" });
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleReportUser = async () => {
    if (!userReportCategory || !ownerId) return;
    setUserReportSubmitting(true);
    try {
      await reportUser(ownerId, userReportCategory, userReportDetail);
      setUserReportOpen(false);
      setUserReportCategory("");
      setUserReportDetail("");
      toast({ title: "Usuario reportado", description: "Nuestro equipo de moderación revisará al anunciante." });
    } catch (e) {
      toast({ title: "No se pudo reportar", description: e instanceof Error ? e.message : "Intenta de nuevo.", variant: "destructive" });
    } finally {
      setUserReportSubmitting(false);
    }
  };

  const toggleSold = (who: "buyer" | "seller") => {
    markSold(listing.id, who, session?.name || (who === "buyer" ? "Comprador" : "Vendedor"));
    setSoldState(loadSold()[listing.id]);
    toast({ title: "Marcado como venta concretada", description: who === "buyer" ? "Comprador confirmado." : "Vendedor confirmado." });
  };

  const requireAuthOrRun = (action: () => void) => {
    // Exige una sesión REAL de Supabase (no demo) para contactar/postular/reportar.
    if (!session?.supabase) {
      toast({
        title: "Inicia sesión para continuar",
        description: "Necesitas una cuenta para contactar al anunciante.",
      });
      navigate(`/auth?redirect=/aviso/${listing.id}`);
      return;
    }
    action();
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !id) return;
    if (!ownerId) {
      toast({ title: "No disponible", description: "No se pudo identificar al anunciante.", variant: "destructive" });
      return;
    }
    try {
      const convId = await getOrCreateConversation(id, ownerId);
      await sendMessage(convId, messageText);
      trackEvent(id, "contact_click"); // REQ-08: clic de contacto
      setMessageOpen(false);
      toast({
        title: "Mensaje enviado",
        description: `${listing.advertiser} recibirá tu consulta. Abriendo tu conversación…`,
      });
      const base = session?.role === "anunciante" ? "anunciante" : "buscador";
      setTimeout(() => navigate(`/dashboard/${base}/mensajes?c=${convId}`), 500);
    } catch (e) {
      toast({
        title: "No se pudo enviar",
        description: e instanceof Error ? e.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    }
  };

  const handleRevealPhone = () => {
    setPhoneRevealed(true);
    setPhoneOpen(true);
    if (id) trackEvent(id, "phone_click"); // REQ-08: clic de contacto (teléfono)
  };

  const handleApply = async () => {
    if (!id) return;
    if (!applyCv) {
      toast({ title: "Adjunta tu CV", description: "Sube tu CV en formato PDF para postular.", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      await applyToListing(id, applyMsg, applyCv);
      setMyApp("pending");
      closeApply();
      toast({ title: "Postulación enviada", description: "El anunciante recibió tu CV y revisará tu postulación." });
    } catch (e) {
      toast({
        title: "No se pudo postular",
        description: e instanceof Error ? e.message : "Intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  const handleCopyPhone = async () => {
    try {
      await navigator.clipboard.writeText(phoneNumber);
      toast({ title: "Teléfono copiado", description: phoneNumber });
    } catch {
      toast({ title: "No se pudo copiar", description: phoneNumber });
    }
  };

  const formatPrice = (price: number, currency: string) =>
    currency === "USD" ? `US$ ${price.toLocaleString()}` : `S/ ${price.toLocaleString()}`;

  const specs = [
    { label: "Categoría", value: category?.name ?? listing.category },
    { label: "Condición", value: "—" },
    { label: "Ubicación", value: listing.location },
    { label: "Publicado", value: new Date(listing.date).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" }) },
    { label: "Código de aviso", value: `EFFE-${listing.id.padStart(6, "0")}` },
    { label: "Vistas", value: `${listing.views.toLocaleString()} visualizaciones` },
  ];

  const features = [
    "Garantía verificada por eFFe",
    "Anunciante validado con RUC",
    "Pago seguro a través de la plataforma",
    "Soporte 24/7 durante la transacción",
    "Devolución dentro de 7 días",
  ];


  // Mientras se verifica la sesión (o se redirige al login) no mostramos el detalle.
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-24 text-center text-muted-foreground text-sm">
          Verificando tu sesión…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Breadcrumbs */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 md:px-6 py-3 flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto whitespace-nowrap">
          <Link to="/" className="hover:text-foreground">Inicio</Link>
          <ChevronRight size={12} />
          <Link to="/buscar" className="hover:text-foreground">Explorar</Link>
          <ChevronRight size={12} />
          <Link to={`/buscar?cat=${listing.category}`} className="hover:text-foreground capitalize">{category?.name ?? listing.category}</Link>
          <ChevronRight size={12} />
          <span className="text-foreground font-medium truncate">{listing.title}</span>
        </div>
      </div>

      {/* Back link */}
      <div className="container mx-auto px-4 md:px-6 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} /> Volver a resultados
        </button>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 lg:gap-12">
        {/* LEFT — Gallery + Content */}
        <div className="min-w-0 space-y-10">
          {/* Gallery */}
          <section>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
              <div className="relative bg-muted overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                <img src={gallery[activeImg]} alt={listing.title} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute top-4 left-4 flex flex-wrap gap-1.5 max-w-[70%]">
                  {listing.featured && (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-secondary text-secondary-foreground text-[10px] font-bold uppercase tracking-wider shadow-md">
                      <Award size={11} /> Destacado
                    </span>
                  )}
                  {listing.urgent && (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-destructive text-destructive-foreground text-[10px] font-bold uppercase tracking-wider shadow-md">
                      <Flame size={11} /> Urgente
                    </span>
                  )}
                  {listing.confidential && (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-md">
                      <EyeOff size={11} /> Confidencial
                    </span>
                  )}
                </div>
                <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-3 py-1.5 bg-white/95 backdrop-blur-sm text-primary text-[10px] font-bold uppercase tracking-wider shadow-sm">
                  <ShieldCheck size={11} /> Verificado eFFe
                </span>
                <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/60 text-white text-xs font-semibold rounded-full">
                  {activeImg + 1} / {gallery.length}
                </div>
              </div>
              <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto md:max-h-[480px]">
                {gallery.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`relative shrink-0 w-24 md:w-full bg-muted overflow-hidden border-2 transition-all ${activeImg === i ? "border-secondary" : "border-transparent hover:border-border"}`}
                    style={{ aspectRatio: "4 / 3" }}
                  >
                    <img src={src} alt={`Vista ${i + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Title + actions */}
          <section className="space-y-4">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary">{category?.name ?? listing.category}</span>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight leading-tight">{listing.title}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><MapPin size={14} className="text-secondary" /> {listing.location}</span>
              <span className="flex items-center gap-1.5"><Eye size={14} /> {listing.views.toLocaleString()} vistas</span>
              <span className="flex items-center gap-1.5"><Calendar size={14} /> Publicado el {new Date(listing.date).toLocaleDateString("es-PE")}</span>
              <span className="flex items-center gap-1.5"><Star size={14} className="text-secondary fill-secondary" /> {sellerRating.toFixed(1)} ({reviewCount} reseña{reviewCount === 1 ? "" : "s"})</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full"
                onClick={() =>
                  requireAuthOrRun(async () => {
                    const res = await toggle(listing.id);
                    if (res === null) {
                      toast({ title: "Disponible con avisos reales" });
                      return;
                    }
                    toast({ title: res ? "Guardado en favoritos" : "Quitado de favoritos" });
                  })
                }
              >
                <Heart size={14} className={fav ? "fill-secondary text-secondary" : ""} /> {fav ? "Guardado" : "Guardar"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 rounded-full"><Share2 size={14} /> Compartir</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={() => shareListingWhatsApp(listing.title, listing.id)}
                  >
                    <MessageCircle size={16} className="text-[#25D366]" /> WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2"
                    onClick={async () => {
                      const ok = await copyListingLink(listing.id);
                      toast({
                        title: ok ? "Enlace copiado" : "No se pudo copiar",
                        description: ok ? "Ya puedes pegarlo donde quieras." : "Inténtalo de nuevo.",
                        variant: ok ? undefined : "destructive",
                      });
                    }}
                  >
                    <Link2 size={16} /> Copiar enlace
                  </DropdownMenuItem>
                  {canSystemShare() && (
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => shareListingSystem(listing.title, listing.id)}
                    >
                      <Share2 size={16} /> Más opciones…
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" className="gap-2 rounded-full" onClick={() => requireAuthOrRun(() => setReportOpen(true))}>
                <Flag size={14} /> Reportar
              </Button>
            </div>
          </section>

          {/* Description */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-3">Descripción</h2>
            <h3 className="text-2xl font-bold text-foreground mb-4">Sobre este aviso</h3>
            <p className="text-foreground/85 leading-[1.75] text-base">
              {listing.description} Esta oportunidad ha sido revisada y aprobada por el equipo de eFFe Multiclasificados para garantizar la transparencia de la información, la verificación del anunciante y la disponibilidad del producto o servicio. El anunciante responde dentro de las primeras 4 horas en promedio.
            </p>
            <p className="text-foreground/85 leading-[1.75] text-base mt-4">
              Si necesitas más fotografías, ficha técnica, ubicación exacta o coordinar una visita / videollamada, utiliza el panel lateral para enviar un mensaje directo.
            </p>

            {/* PDF adjunto por el anunciante (adicional). Enlace firmado temporal. */}
            {docUrl && (
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 border border-secondary/40 bg-secondary/5 text-secondary font-semibold text-sm hover:bg-secondary hover:text-secondary-foreground transition-colors"
              >
                <FileText size={16} /> Ver documento (PDF)
              </a>
            )}
          </section>

          {/* Spec table */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-3">Detalles</h2>
            <h3 className="text-2xl font-bold text-foreground mb-6">Información del aviso</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-border">
              {specs.map((s) => (
                <div key={s.label} className="flex flex-col gap-1 py-4 border-b border-border sm:[&:nth-child(odd)]:pr-6 sm:[&:nth-child(even)]:pl-6 sm:[&:nth-child(even)]:border-l">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">{s.label}</span>
                  <span className="text-sm font-semibold text-foreground">{s.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* What's included */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-3">Garantías</h2>
            <h3 className="text-2xl font-bold text-foreground mb-6">Lo que incluye este aviso</h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-6">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-foreground/85">
                  <CheckCircle2 size={18} className="text-secondary shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </section>

          {/* Ubicación */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-3">Ubicación</h2>
            <h3 className="text-2xl font-bold text-foreground mb-6">{listing.location}</h3>
            {/* isolate + translateZ(0): fuerzan a este contenedor a ser su propia
                capa de composición aislada, para que el recorte overflow-hidden
                "atrape" al pin de precio y a los controles de zoom (overlays
                absolutos sobre el iframe) y no se escapen al hacer scroll en
                WebView/GPU (se veían pegados arriba en móvil y web). */}
            <div className="relative h-72 md:h-96 bg-muted overflow-hidden border border-border isolate [transform:translateZ(0)]">
              {typeof listing.lat === "number" && typeof listing.lng === "number" ? (
                <ListingLocationMap lat={listing.lat} lng={listing.lng} price={listing.price} currency={listing.currency} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shadow-2xl ring-8 ring-secondary/20">
                    <MapPin size={20} />
                  </div>
                  <span className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-lg">
                    {listing.location}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">Este aviso aún no tiene una ubicación exacta en el mapa.</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">Ubicación aproximada por seguridad. La dirección exacta se comparte tras coordinar con el anunciante.</p>
          </section>

          {/* Reseñas (REQ-07) */}
          {isJobs && listing.id && (
            <ListingReviews listingId={listing.id} isOwner={isOwner} onChange={loadReviewMeta} />
          )}
        </div>

        {/* RIGHT — Sticky purchase / contact panel */}
        <aside className="lg:sticky lg:top-24 self-start space-y-4">
          {/* Price card */}
          <div className="bg-card border border-border p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-secondary" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary">Precio</span>
            </div>
            <div>
              <p className="text-4xl font-extrabold text-primary tracking-tight">{formatPrice(listing.price, listing.currency)}</p>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5"><Clock size={12} /> Precio vigente</p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {isOwner && (
                <div className="w-full h-12 flex items-center justify-center gap-2 border border-secondary/40 bg-secondary/5 text-xs font-bold uppercase tracking-wider text-secondary">
                  <ShieldCheck size={16} /> Este es tu aviso
                </div>
              )}
              {!isOwner && (
                <>
                  <Button
                    size="lg"
                    className="w-full gap-2 font-bold uppercase tracking-wider text-xs rounded-none h-12"
                    onClick={() => requireAuthOrRun(() => setMessageOpen(true))}
                  >
                    <MessageSquare size={16} /> Enviar mensaje
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full gap-2 font-bold uppercase tracking-wider text-xs rounded-none h-12"
                    onClick={() => requireAuthOrRun(handleRevealPhone)}
                  >
                    <Phone size={16} />
                    {phoneRevealed ? phoneNumber : "Mostrar teléfono"}
                  </Button>
                </>
              )}

              {isJobs && !isOwner && (
                myApp ? (
                  <div className="w-full h-12 flex items-center justify-center gap-2 border border-secondary/40 bg-secondary/5 text-xs font-bold uppercase tracking-wider text-secondary">
                    <ClipboardCheck size={16} /> Postulación: {STATUS_LABEL[myApp]}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full gap-2 font-bold uppercase tracking-wider text-xs rounded-none h-12"
                    onClick={() => requireAuthOrRun(() => setApplyOpen(true))}
                  >
                    <ClipboardCheck size={16} /> Postularme
                  </Button>
                )
              )}
            </div>

            <div className="pt-4 border-t border-border space-y-2 text-xs text-muted-foreground">
              <p className="flex items-start gap-2"><ShieldCheck size={14} className="text-secondary mt-0.5 shrink-0" /> Anunciante verificado y avalado por eFFe.</p>
              <p className="flex items-start gap-2"><CheckCircle2 size={14} className="text-secondary mt-0.5 shrink-0" /> Pagos protegidos y sin comisión para el comprador.</p>
            </div>
          </div>

          {/* Seller card */}
          <div className="bg-card border border-border p-6 space-y-4 shadow-sm">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary">Publicado por</span>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full gradient-secondary text-secondary-foreground flex items-center justify-center font-extrabold text-lg">
                {listing.advertiser.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-foreground truncate flex items-center gap-1.5">
                  {listing.advertiser}
                  <ShieldCheck size={14} className="text-secondary shrink-0" />
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Building2 size={11} /> {listing.location || "—"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="text-center py-2 bg-muted/40 border border-border">
                <p className="text-base font-extrabold text-primary">{sellerRating.toFixed(1)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Rating</p>
              </div>
              <div className="text-center py-2 bg-muted/40 border border-border">
                <p className="text-base font-extrabold text-primary">0</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Avisos</p>
              </div>
              <div className="text-center py-2 bg-muted/40 border border-border">
                <p className="text-base font-extrabold text-primary">Nuevo</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Antigüedad</p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full rounded-none gap-2 text-xs uppercase tracking-wider font-bold"
              disabled={!ownerId}
              onClick={() => ownerId && navigate(`/buscar?owner=${ownerId}`)}
            >
              <Users size={14} /> Ver todos sus avisos
            </Button>
            {!isOwner && (
              <button
                onClick={() => requireAuthOrRun(() => setUserReportOpen(true))}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors pt-1"
              >
                <Flag size={12} /> Reportar a este usuario
              </button>
            )}
          </div>

          {/* Sale closure — no aplica a empleos (no es una venta de producto) */}
          {!isJobs && (
            <div className="bg-card border border-border p-5 space-y-3">
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary">Cierre de venta</p>
              <p className="text-xs text-muted-foreground">Marca si concretaron la transacción. Ambos lados pueden confirmar.</p>
              {isOwner ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={!!soldState?.seller} onCheckedChange={() => requireAuthOrRun(() => toggleSold("seller"))} />
                  <span>Soy el vendedor y la venta se concretó</span>
                </label>
              ) : (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={!!soldState?.buyer} onCheckedChange={() => requireAuthOrRun(() => toggleSold("buyer"))} />
                  <span>Soy el comprador y la venta se concretó</span>
                </label>
              )}
              {/* Estado del otro lado (solo informativo) */}
              {isOwner && soldState?.buyer && (
                <p className="text-[11px] text-muted-foreground">El comprador ya confirmó la transacción.</p>
              )}
              {!isOwner && soldState?.seller && (
                <p className="text-[11px] text-muted-foreground">El vendedor ya confirmó la transacción.</p>
              )}
              {(soldState?.buyer || soldState?.seller) && (
                <p className="text-[11px] text-success font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} /> Venta registrada
                </p>
              )}
            </div>
          )}

          {/* Safety tips */}
          <div className="bg-muted/30 border border-border p-5 text-xs text-muted-foreground space-y-2">
            <p className="font-bold uppercase tracking-wider text-[10px] text-foreground">Consejos de seguridad</p>
            <ul className="space-y-1.5 leading-relaxed">
              <li>· Coordina visitas en lugares públicos.</li>
              <li>· No realices pagos por adelantado fuera de la plataforma.</li>
              <li>· Verifica documentos y comprobantes antes de cerrar.</li>
            </ul>
          </div>
        </aside>

      </div>

      {/* Related */}
      <section className="container mx-auto px-4 md:px-6 pt-14 md:pt-20 pb-28 md:pb-20 border-t">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-2">Sigue explorando</p>
            <h2 className="text-2xl md:text-4xl font-extrabold text-foreground tracking-tight">Avisos similares</h2>
          </div>
          <Link to="/buscar" className="text-xs font-bold uppercase tracking-[0.2em] text-primary border-b-2 border-secondary pb-1 hover:text-secondary transition-colors">
            Ver más →
          </Link>
        </div>
        {related.length === 0 ? (
          <div className="border border-dashed border-border py-12 text-center">
            <p className="text-muted-foreground text-sm">Aún no hay otros avisos para mostrar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 5xl:grid-cols-8 gap-x-6 gap-y-10">
            {related.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </section>

      {/* Message dialog */}
      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent
          className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
          onFocusCapture={scrollFocusedIntoView}
          style={kbPad ? { paddingBottom: kbPad + 24 } : undefined}
        >
          <DialogHeader>
            <DialogTitle>Enviar mensaje a {listing.advertiser}</DialogTitle>
            <DialogDescription>
              Sobre: <span className="font-medium text-foreground">{listing.title}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="msg">Tu mensaje</Label>
            <Textarea
              id="msg"
              rows={5}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Cuéntale al anunciante qué te interesa, fechas, formas de pago…"
            />
            <p className="text-xs text-muted-foreground">
              Tu identidad se compartirá con el anunciante para coordinar la transacción.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMessageOpen(false)}>Cancelar</Button>
            <Button onClick={handleSendMessage} className="gap-2">
              <Send size={14} /> Enviar mensaje
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phone dialog */}
      <Dialog open={phoneOpen} onOpenChange={setPhoneOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Teléfono del anunciante</DialogTitle>
            <DialogDescription>
              Disponible de lunes a sábado, 9:00 a 19:00. Menciona el código del aviso al llamar.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted/30 p-5 text-center space-y-2">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary">
              {listing.advertiser}
            </p>
            <p className="text-2xl font-extrabold text-primary tracking-tight">{phoneNumber}</p>
            <p className="text-xs text-muted-foreground">Código de aviso: EFFE-{listing.id.padStart(6, "0")}</p>
          </div>
          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="outline" onClick={handleCopyPhone} className="gap-2">
              <Copy size={14} /> Copiar
            </Button>
            <Button asChild className="gap-2">
              <a href={`tel:${phoneNumber.replace(/\s+/g, "")}`}>
                <Phone size={14} /> Llamar ahora
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Postulación dialog */}
      <Dialog open={applyOpen} onOpenChange={(o) => (o ? setApplyOpen(true) : closeApply())}>
        <DialogContent
          className="sm:max-w-md max-h-[90vh] overflow-y-auto"
          onFocusCapture={scrollFocusedIntoView}
          style={kbPad ? { paddingBottom: kbPad + 24 } : undefined}
        >
          <DialogHeader>
            <DialogTitle>Postular a este aviso</DialogTitle>
            <DialogDescription>
              Tu postulación se enviará a {listing.advertiser || "el anunciante"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>CV en PDF <span className="text-destructive">*</span></Label>
              {applyCv ? (
                <div className="flex items-center gap-2 rounded-md border border-secondary/40 bg-secondary/5 px-3 py-2 text-sm">
                  <FileText size={16} className="text-secondary shrink-0" />
                  <span className="truncate flex-1">{applyCv.name}</span>
                  <button
                    type="button"
                    onClick={() => setApplyCv(null)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="Quitar archivo"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="applycv"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground hover:border-secondary hover:text-secondary transition-colors"
                >
                  <Upload size={16} /> Selecciona tu CV (PDF, máx. 5 MB)
                </label>
              )}
              <Input
                id="applycv"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={onPickCv}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applymsg">Mensaje (opcional)</Label>
              <Textarea
                id="applymsg"
                rows={4}
                value={applyMsg}
                onChange={(e) => setApplyMsg(e.target.value)}
                placeholder="Preséntate o cuenta por qué te interesa este aviso…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeApply} disabled={applying}>Cancelar</Button>
            <Button onClick={handleApply} className="gap-2" disabled={applying || !applyCv}>
              <ClipboardCheck size={14} /> {applying ? "Enviando…" : "Enviar postulación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent
          className="sm:max-w-md max-h-[90vh] overflow-y-auto"
          onFocusCapture={scrollFocusedIntoView}
          style={kbPad ? { paddingBottom: kbPad + 24 } : undefined}
        >
          <DialogHeader>
            <DialogTitle>Reportar aviso</DialogTitle>
            <DialogDescription>Cuéntanos qué problema observas con "{listing.title}".</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo del reporte</Label>
            <Select value={reportCategory} onValueChange={setReportCategory}>
              <SelectTrigger><SelectValue placeholder="Selecciona un motivo" /></SelectTrigger>
              <SelectContent>
                {LISTING_REPORT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label htmlFor="reason">Detalle (opcional)</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reportDetail}
              onChange={(e) => setReportDetail(e.target.value)}
              placeholder="Cuéntanos más sobre el problema…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>Cancelar</Button>
            <Button onClick={handleReport} disabled={!reportCategory || reportSubmitting} className="gap-2">
              <Flag size={14} /> {reportSubmitting ? "Enviando…" : "Enviar reporte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reportar usuario (REQ-10) */}
      <Dialog open={userReportOpen} onOpenChange={setUserReportOpen}>
        <DialogContent
          className="sm:max-w-md max-h-[90vh] overflow-y-auto"
          onFocusCapture={scrollFocusedIntoView}
          style={kbPad ? { paddingBottom: kbPad + 24 } : undefined}
        >
          <DialogHeader>
            <DialogTitle>Reportar usuario</DialogTitle>
            <DialogDescription>Cuéntanos qué problema observas con {listing.advertiser || "este anunciante"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo del reporte</Label>
            <Select value={userReportCategory} onValueChange={setUserReportCategory}>
              <SelectTrigger><SelectValue placeholder="Selecciona un motivo" /></SelectTrigger>
              <SelectContent>
                {USER_REPORT_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label htmlFor="user-reason">Detalle (opcional)</Label>
            <Textarea
              id="user-reason"
              rows={3}
              value={userReportDetail}
              onChange={(e) => setUserReportDetail(e.target.value)}
              placeholder="Cuéntanos más sobre el problema…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUserReportOpen(false)}>Cancelar</Button>
            <Button onClick={handleReportUser} disabled={!userReportCategory || userReportSubmitting} className="gap-2">
              <Flag size={14} /> {userReportSubmitting ? "Enviando…" : "Enviar reporte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

