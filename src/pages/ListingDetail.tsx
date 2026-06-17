import { useParams, Link, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { ListingCard } from "@/components/ListingCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { featuredListings, categories } from "@/data/mockData";
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
  Mail,
  CheckCircle2,
  ChevronLeft,
  Tag,
  Award,
  Clock,
  Building2,
  Users,
  Copy,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useSession } from "@/hooks/useSession";


export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const listing = featuredListings.find((l) => l.id === id) ?? featuredListings[0];
  const category = categories.find((c) => c.id === listing.category);

  const gallery = useMemo(
    () => [
      listing.imageUrl,
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&h=800&fit=crop",
      "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&h=800&fit=crop",
    ],
    [listing.imageUrl],
  );

  const [activeImg, setActiveImg] = useState(0);

  const formatPrice = (price: number, currency: string) =>
    currency === "USD" ? `US$ ${price.toLocaleString()}` : `S/ ${price.toLocaleString()}`;

  const specs = [
    { label: "Categoría", value: category?.name ?? listing.category },
    { label: "Condición", value: "Nuevo / Como nuevo" },
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

  const related = featuredListings.filter((l) => l.id !== listing.id).slice(0, 4);

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
                {listing.featured && (
                  <span className="absolute top-4 left-4 inline-flex items-center gap-1 px-3 py-1.5 bg-secondary text-secondary-foreground text-[10px] font-bold uppercase tracking-wider shadow-md">
                    <Award size={11} /> Destacado
                  </span>
                )}
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
              <span className="flex items-center gap-1.5"><Star size={14} className="text-secondary fill-secondary" /> 4.8 (132 reseñas)</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" className="gap-2 rounded-full"><Heart size={14} /> Guardar</Button>
              <Button variant="outline" size="sm" className="gap-2 rounded-full"><Share2 size={14} /> Compartir</Button>
              <Button variant="outline" size="sm" className="gap-2 rounded-full"><Flag size={14} /> Reportar</Button>
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
              Si necesitas más fotografías, ficha técnica, ubicación exacta o coordinar una visita / videollamada, utiliza el panel lateral para enviar un mensaje directo. También puedes solicitar una cotización formal con datos fiscales.
            </p>
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

          {/* Location mock */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-3">Ubicación</h2>
            <h3 className="text-2xl font-bold text-foreground mb-6">{listing.location}</h3>
            <div className="relative h-72 md:h-96 bg-muted overflow-hidden border border-border">
              <img src="https://images.unsplash.com/photo-1569336415962-a4bd9f69cd83?w=1600&h=900&fit=crop" alt="Mapa de ubicación" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center shadow-2xl ring-8 ring-secondary/20 animate-pulse">
                  <MapPin size={20} />
                </div>
                <span className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-lg">
                  {listing.location}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Ubicación aproximada por seguridad. La dirección exacta se comparte tras coordinar con el anunciante.</p>
          </section>
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
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5"><Clock size={12} /> Precio actualizado hace 2 días</p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button size="lg" className="w-full gap-2 font-bold uppercase tracking-wider text-xs rounded-none h-12">
                <MessageSquare size={16} /> Enviar mensaje
              </Button>
              <Button variant="outline" size="lg" className="w-full gap-2 font-bold uppercase tracking-wider text-xs rounded-none h-12">
                <Phone size={16} /> Mostrar teléfono
              </Button>
              <Button variant="ghost" size="lg" className="w-full gap-2 font-semibold rounded-none h-11 text-sm">
                <Mail size={16} /> Solicitar cotización
              </Button>
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
                  <Building2 size={11} /> Empresa Pro · Lima
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              <div className="text-center py-2 bg-muted/40 border border-border">
                <p className="text-base font-extrabold text-primary">4.9</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Rating</p>
              </div>
              <div className="text-center py-2 bg-muted/40 border border-border">
                <p className="text-base font-extrabold text-primary">132</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Avisos</p>
              </div>
              <div className="text-center py-2 bg-muted/40 border border-border">
                <p className="text-base font-extrabold text-primary">3y</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Antigüedad</p>
              </div>
            </div>
            <Button variant="outline" className="w-full rounded-none gap-2 text-xs uppercase tracking-wider font-bold">
              <Users size={14} /> Ver todos sus avisos
            </Button>
          </div>

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
      <section className="container mx-auto px-4 md:px-6 py-14 md:py-20 border-t">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-2">Sigue explorando</p>
            <h2 className="text-2xl md:text-4xl font-extrabold text-foreground tracking-tight">Avisos similares</h2>
          </div>
          <Link to="/buscar" className="text-xs font-bold uppercase tracking-[0.2em] text-primary border-b-2 border-secondary pb-1 hover:text-secondary transition-colors">
            Ver más →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
          {related.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      </section>
    </div>
  );
}
