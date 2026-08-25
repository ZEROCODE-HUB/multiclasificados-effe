import { Navbar } from "@/components/Navbar";
import { imgUrl } from "@/lib/imageUrl";
import { BrandMark } from "@/components/BrandMark";
import { HeroSearch } from "@/components/HeroSearch";
import { CategoryGrid } from "@/components/CategoryGrid";
import { ListingCard } from "@/components/ListingCard";
import { CountUp } from "@/components/CountUp";
import { LibroReclamaciones } from "@/components/LibroReclamaciones";
import { TermsDialog } from "@/components/LegalTerms";
import { type Listing } from "@/data/mockData";
import { fetchListings, searchListings } from "@/lib/listings";
import {
  DEPARTAMENTOS, departamentoPorId, departamentoGuardado, guardarDepartamento,
  type Departamento,
} from "@/lib/departamentos";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchPlatformStats, type PlatformStats } from "@/lib/stats";
import { useSession } from "@/hooks/useSession";
import { useFittingCount } from "@/hooks/useFittingCount";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

// El mapa de la portada llega aparte y solo cuando la sección entra en pantalla:
// el SDK de mapas no es ligero y esta sección ni siquiera se muestra en móvil.
// Además cada mapa que se monta es una carga facturable, así que no conviene
// pagarla por quien nunca baja hasta aquí.
const PeruMapTeaser = lazy(() => import("@/components/PeruMapTeaser"));
// WebP 1600×900 (191 KiB) en vez del JPG 1920×1080 (378 KiB). Se sirve desde
// /public (ruta estable `/hero-bg.webp`) en lugar de un import hasheado, para
// poder precargarlo desde el <head> del index.html y que sea el LCP descubrible
// antes de ejecutar el bundle (IT2-008). El .jpg original queda como fuente.
const heroBg = "/hero-bg.webp";
import { ArrowRight, BadgeCheck, Gem, Headset, Star, TrendingUp, CheckCircle2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

// Rejilla de avisos de la portada. Antes iba por columnas fijas (2 → 4 → 5…) y
// las tarjetas salían mucho más anchas que en Explorar, que reparte en más
// columnas y además cede espacio a la barra de filtros: a 1536 px medían ~350 px
// aquí frente a ~180 px allí. Con `auto-fill` el ancho manda sobre el número de
// columnas, así que la tarjeta mide lo mismo en las dos pantallas.
// `auto-fill` y NO `auto-fit`: con pocos avisos, auto-fit los estiraría a lo
// ancho y volveríamos al problema.
//
// Los dos números van en constantes porque `useFittingCount` tiene que hacer la
// MISMA cuenta que el CSS para decidir cuántos avisos se muestran: si se cambia
// el ancho mínimo aquí y no allí, aparecería una segunda fila a medias.
const CARD_MIN_WIDTH = 230;
const CARD_GAP = 16; // gap-x-4
const LISTING_GRID =
  "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-4";

// Cuántos avisos pide la portada. Son dos secciones que se reparten la lista
// para no enseñar los mismos avisos dos veces, y cada una llena una fila: en un
// monitor de 2560 px caben 10 por fila, así que 20 cubre las dos.
const HOME_LISTINGS = 20;

// Cuántos avisos muestra la sección del departamento: una fila en escritorio, y
// en móvil lo justo para que se vea que hay más sin llenar la portada de scroll.
const CERCANOS = 4;
// Los que se suponen por fila hasta poder medir el ancho de verdad.
const FALLBACK_COLS = 8;

const benefits = [
  {
    icon: BadgeCheck,
    eyebrow: "Confianza",
    title: "Anunciantes verificados",
    desc: "Validamos cada empresa con RUC y revisión manual para que solo conectes con cuentas reales y operativas.",
    metric: "100%",
    metricLabel: "Cuentas auditadas",
  },
  {
    icon: Gem,
    eyebrow: "Experiencia premium",
    title: "Visibilidad de alto impacto",
    desc: "Tu aviso vive en una plataforma profesional con presentación editorial pensada para convertir más rápido.",
    metric: "3.2x",
    metricLabel: "Más visualizaciones",
  },
  {
    icon: Headset,
    eyebrow: "Soporte humano",
    title: "Asesoría dedicada",
    desc: "Un equipo real acompaña tus operaciones de principio a fin, con respuesta el mismo día hábil.",
    metric: "24/7",
    metricLabel: "Acompañamiento",
  },
];

const steps = [
  { n: "01", title: "Crea tu cuenta", desc: "Regístrate como anunciante o buscador en menos de un minuto." },
  { n: "02", title: "Publica o explora", desc: "Sube tu aviso con fotos profesionales o filtra entre miles de oportunidades." },
  { n: "03", title: "Conecta y cierra", desc: "Conversa de forma segura por chat y concreta la operación con confianza." },
];

const testimonials = [
  {
    name: "María Salazar",
    role: "Anunciante Inmobiliaria",
    quote: "Publiqué un departamento un lunes y el viernes ya tenía 12 visitas concretadas. La plataforma es seria y los leads son de calidad.",
    rating: 5,
  },
  {
    name: "Diego Romero",
    role: "Buscador de empleo",
    quote: "Encontré mi nuevo puesto de desarrollador en 3 semanas. Las alertas y filtros me ahorraron horas de búsqueda.",
    rating: 5,
  },
  {
    name: "TechPeru SAC",
    role: "Empresa Pro",
    quote: "Las herramientas de estadísticas nos permitieron optimizar nuestras campañas y triplicar las postulaciones.",
    rating: 5,
  },
];

const Index = () => {
  // La barra inferior fija (MobileBottomNav) aparece en móvil solo para
  // anunciante/buscador logueados; si está, reservamos espacio abajo para que
  // la última sección (categorías) no quede tapada y sí se pueda alcanzar.
  const session = useSession();
  const hasBottomNav = !!session && (session.role === "anunciante" || session.role === "buscador");

  // CTA de "registro" del home según sesión: sin sesión invita a crear cuenta;
  // ya logueado, "Crear cuenta gratis"/"Empezar gratis" no tiene sentido, así que
  // un usuario normal va a publicar y el staff a su panel.
  const isUser = hasBottomNav; // anunciante/buscador logueado
  const loggedCta = isUser
    ? { to: "/dashboard/anunciante/publicar", label: "Publicar tu aviso" }
    : { to: `/dashboard/${session?.role ?? ""}`, label: "Ir a mi panel" };

  // Avisos reales desde Supabase (vacío hasta que existan avisos publicados).
  const [listings, setListings] = useState<Listing[]>([]);
  // Cada sección enseña UNA fila: los avisos que entren en el ancho disponible.
  // Así no queda nunca una última fila a medias.
  const semana = useFittingCount(CARD_MIN_WIDTH, CARD_GAP, FALLBACK_COLS);
  const nuevos = useFittingCount(CARD_MIN_WIDTH, CARD_GAP, FALLBACK_COLS);
  const [platform, setPlatform] = useState<PlatformStats | null>(null);
  // Términos/Privacidad del footer: abren el documento legal (antes eran href="#").
  const [termsOpen, setTermsOpen] = useState(false);
  useEffect(() => {
    fetchPlatformStats().then(setPlatform);
  }, []);

  // El mapa del Perú solo se descarga cuando el usuario llega hasta su sección.
  // La sección es `hidden md:block`, y un elemento con `display:none` nunca
  // "entra en pantalla": en móvil, donde no se ve, el mapa no se carga jamás.
  // Sin IntersectionObserver (jsdom, en las pruebas) tampoco: es un adorno.
  const mapaRef = useRef<HTMLDivElement>(null);
  const [mapaVisible, setMapaVisible] = useState(false);
  useEffect(() => {
    const el = mapaRef.current;
    if (!el || mapaVisible || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setMapaVisible(true);
          io.disconnect();
        }
      },
      // Un poco antes de que asome, para que no se vea cargar.
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mapaVisible]);

  // El departamento que el usuario ya eligió, aquí o en el buscador. Manda
  // sobre TODA la portada, no solo sobre la sección "Avisos en …": si alguien
  // dice que está en Lima, enseñarle un destacado de Piura en la rejilla de
  // abajo es enseñarle algo que no puede ir a ver.
  const [departamento, setDepartamento] = useState<Departamento | null>(() => departamentoGuardado());

  const elegirDepartamento = (id: string) => {
    const d = departamentoPorId(id);
    setDepartamento(d);
    guardarDepartamento(d);
  };

  useEffect(() => {
    let vigente = true;
    // Sin departamento elegido, la portada es la de todo el país.
    const cargar = departamento
      ? searchListings({ department: departamento.id, limit: HOME_LISTINGS + CERCANOS })
      : fetchListings({ limit: HOME_LISTINGS + CERCANOS });
    cargar.then((rows) => { if (vigente) setListings(rows); });
    return () => { vigente = false; };
  }, [departamento]);

  // Las tres rejillas salen de la MISMA lista y no se pisan: antes "Avisos en
  // tu departamento" hacía su propia consulta y, al filtrar también las de
  // abajo, los cuatro primeros avisos habrían salido dos veces seguidos.
  const cercanos = departamento ? listings.slice(0, CERCANOS) : [];
  const restoDesde = cercanos.length;
  // Y la segunda rejilla arranca donde termina la primera: si arrancara en un
  // índice fijo, en pantallas anchas (donde la primera fila se lleva más
  // avisos) las dos volverían a repetir avisos.
  const nuevosDesde = restoDesde + semana.count;

  // Métricas exactas de la BD para el hero (con respaldo mientras carga).
  const activeListingsStr = platform ? platform.activeListings.toLocaleString() : "…";
  const heroStats = useMemo(
    () => [
      { value: activeListingsStr, label: "Avisos activos" },
      { value: platform ? platform.totalUsers.toLocaleString() : "…", label: "Usuarios registrados" },
      { value: "24/7", label: "Soporte dedicado" },
      { value: platform?.satisfaction != null ? `${platform.satisfaction}%` : "—", label: "Satisfacción" },
    ],
    [platform, activeListingsStr],
  );

  return (
    <div className={`min-h-screen bg-background ${hasBottomNav ? "pb-[calc(var(--nav-bottom)+2rem)] lg:pb-0" : ""}`}>
      {/* Header — distinct white bar above hero */}
      <Navbar />

      {/* Landmark principal para lectores de pantalla (WCAG / "main landmark"). */}
      <main>
      {/* Móvil: buscador con título en la parte superior (look app) */}
      <section className="md:hidden gradient-hero px-4 pt-7 pb-6">
        <h1 className="text-primary-foreground font-extrabold tracking-tight text-2xl leading-snug mb-1.5">
          Donde los <span className="italic text-secondary font-semibold">negocios</span> suceden.
        </h1>
        <p className="text-primary-foreground/80 text-sm leading-relaxed mb-5">
          Inmuebles, vehículos, maquinaria, empleos y servicios verificados.
        </p>
        <HeroSearch />
      </section>

      {/* Hero — Premium editorial, dos columnas balanceadas (solo desktop) */}
      <section className="relative min-h-[460px] md:min-h-[720px] lg:min-h-[780px] hidden md:flex flex-col gradient-hero overflow-hidden">
        <img
          src={heroBg}
          alt="Marketplace profesional EFFE Multiclasificados"
          width={1600}
          height={900}
          className="absolute inset-0 w-full h-full object-cover opacity-80"
          fetchPriority="high"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900/45 via-blue-800/40 to-blue-950/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950/60 via-blue-800/30 to-transparent" />
        <div className="absolute inset-0 bg-dot-pattern opacity-15" />

        <div className="relative z-10 flex-1 flex items-center">
          <div className="container mx-auto px-4 md:px-6 py-10 md:py-32 lg:py-40">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
              {/* Columna izquierda: branding + buscador */}
              <div className="lg:col-span-7 xl:col-span-7">
                {/* Branding hero: MULTICLASIFICADOS arriba, EFFE debajo */}
                <h1 className="mb-6 md:mb-8 leading-[0.9]">
                  <span className="block text-primary-foreground/90 font-bold uppercase tracking-[0.32em] text-xs sm:text-sm md:text-lg lg:text-xl mb-2 md:mb-3">
                    Multiclasificados
                  </span>
                  <span className="block text-primary-foreground font-extrabold uppercase tracking-tight text-[56px] sm:text-[88px] md:text-[112px] lg:text-[136px]">
                    EFFE
                  </span>
                </h1>

                {/* Tagline premium — más grande */}
                <p className="text-primary-foreground text-2xl sm:text-3xl md:text-4xl lg:text-5xl mb-3 md:mb-4 font-light leading-snug tracking-tight">
                  Donde los <span className="italic text-secondary font-normal">negocios</span> suceden.
                </p>
                <p className="text-primary-foreground/80 text-sm md:text-base mb-7 md:mb-10 max-w-xl leading-relaxed font-light">
                  Miles de oportunidades verificadas en inmuebles, vehículos, maquinaria, empleos y servicios.
                </p>

                <div className="max-w-3xl">
                  <HeroSearch />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mt-8 md:mt-12 pt-6 md:pt-8 border-t border-primary-foreground/20 max-w-3xl">
                  {heroStats.map((s, i) => (
                    <div
                      key={s.label}
                      className={`px-2 ${i > 0 ? "md:border-l border-primary-foreground/15 md:pl-6" : ""}`}
                    >
                      <p className="text-xl md:text-3xl font-extrabold text-secondary tracking-tight">
                        <CountUp value={s.value} />
                      </p>
                      <p className="text-[10px] md:text-xs text-primary-foreground/70 mt-1 md:mt-2 uppercase tracking-wider">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Columna derecha: una sola tarjeta visual con "avisos activos" (solo desktop) */}
              <div className="hidden lg:flex lg:col-span-5 xl:col-span-5 relative h-[560px]">
                <div className="absolute inset-0 border border-white/20 shadow-2xl overflow-hidden">
                  <img src={listings[0]?.imageUrl ? imgUrl(listings[0].imageUrl, 800) : heroBg} alt="" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-primary/40 to-primary/90" />
                  <div className="absolute inset-x-0 bottom-0 p-8 text-primary-foreground">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={16} className="text-secondary" />
                      <p className="text-[10px] uppercase tracking-[0.32em] text-secondary font-bold">En vivo</p>
                    </div>
                    <p className="text-6xl xl:text-7xl font-extrabold text-secondary tracking-tight leading-none">
                      <CountUp value={activeListingsStr} />
                    </p>
                    <p className="text-primary-foreground text-lg font-semibold mt-3 uppercase tracking-wider">
                      Avisos activos
                    </p>
                    <p className="text-primary-foreground/70 text-sm mt-2 max-w-xs">
                      Oportunidades reales publicadas hoy en toda la plataforma.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      {/* Categories */}
      {/* Los márgenes de escritorio bajan (py-16 → py-10, mb-10 → mb-6) por lo
          mismo que se apaisaron las tarjetas: la sección se comía una pantalla
          entera. En móvil no cambia nada. */}
      <section className="container mx-auto px-4 py-12 md:py-10">
        <div className="text-center max-w-2xl mx-auto mb-8 md:mb-6">
          <p className="text-xs uppercase tracking-widest font-bold text-secondary mb-2">Explora por categoría</p>
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">¿Qué estás buscando hoy?</h2>
        </div>
        <CategoryGrid />
      </section>

      {/* Avisos de tu departamento. Es la sección con más sentido en móvil, así
          que aquí NO se oculta. Si el usuario aún no lo ha elegido, se le
          pregunta aquí; la respuesta se recuerda y la aprovecha el buscador. */}
      <section className="container mx-auto px-4 pb-12 md:pb-16">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6 md:mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-2">Cerca de ti</p>
            <h2 className="text-2xl md:text-4xl font-bold text-foreground">
              {departamento ? `Avisos en ${departamento.nombre}` : "¿Dónde estás?"}
            </h2>
          </div>
          {departamento && cercanos.length > 0 && (
            <Link
              to={`/buscar?dep=${departamento.id}`}
              className="text-xs font-bold uppercase tracking-[0.2em] text-primary border-b-2 border-secondary pb-1 hover:text-secondary transition-colors"
            >
              Ver todos →
            </Link>
          )}
        </div>

        {!departamento ? (
          <div className="border border-dashed border-border p-6 md:p-8 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Dinos tu departamento y te mostramos lo que hay publicado ahí.
            </p>
            <div className="max-w-sm mx-auto">
              <Select onValueChange={elegirDepartamento}>
                <SelectTrigger><SelectValue placeholder="Elige tu departamento" /></SelectTrigger>
                <SelectContent>
                  {DEPARTAMENTOS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : cercanos.length === 0 ? (
          <div className="border border-dashed border-border py-10 text-center">
            <p className="text-muted-foreground text-sm">
              Todavía no hay avisos publicados en {departamento.nombre}.
            </p>
            <Link to="/buscar" className="text-sm font-bold text-secondary hover:underline mt-2 inline-block">
              Ver los de todo el país →
            </Link>
          </div>
        ) : (
          <div className={LISTING_GRID}>
            {cercanos.map((listing) => (
              <ListingCard key={`cerca-${listing.id}`} listing={listing} />
            ))}
          </div>
        )}
        {departamento && (
          <button
            type="button"
            onClick={() => { setDepartamento(null); guardarDepartamento(null); }}
            className="mt-4 text-xs font-semibold text-secondary hover:underline"
          >
            Cambiar de departamento
          </button>
        )}
      </section>

      {/* Benefits — rediseño premium (oculto en móvil para un look más app) */}
      <section className="hidden md:block bg-muted/30 border-y">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
            <p className="text-xs uppercase tracking-[0.28em] font-bold text-secondary mb-3">Por qué elegirnos</p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight uppercase">
              Construido para <span className="text-secondary">operadores</span> serios
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {benefits.map((b, i) => (
              <article
                key={b.title}
                className="group relative bg-card border border-border overflow-hidden transition-all duration-300 hover:border-secondary/50 hover:shadow-2xl hover:-translate-y-1"
              >
                {/* Barra superior decorativa */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-secondary via-secondary/80 to-primary opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="p-7 md:p-9">
                  {/* Número grande + ícono */}
                  <div className="flex items-start justify-between mb-7">
                    <div className="relative w-16 h-16 bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
                      <b.icon size={28} strokeWidth={1.8} />
                      <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-secondary text-secondary-foreground text-[10px] font-extrabold flex items-center justify-center">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-muted-foreground self-end">
                      {b.eyebrow}
                    </span>
                  </div>

                  <h3 className="text-xl md:text-2xl font-extrabold text-foreground mb-3 tracking-tight leading-tight">
                    {b.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-7">
                    {b.desc}
                  </p>

                  {/* Métrica */}
                  <div className="pt-5 border-t border-border flex items-baseline gap-3">
                    <span className="text-3xl font-extrabold text-secondary tracking-tight">{b.metric}</span>
                    <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                      {b.metricLabel}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Listings (oculto en móvil para un look más app) */}
      <section className="hidden md:block container mx-auto px-4 py-14 md:py-20">
        <div className="flex items-end justify-between mb-8 md:mb-10 gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-2">
              {departamento ? `Destacados en ${departamento.nombre}` : "Destacados"}
            </p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight uppercase">Avisos de la semana</h2>
          </div>
          <Link
            to={departamento ? `/buscar?dep=${departamento.id}` : "/buscar"}
            className="text-xs font-bold uppercase tracking-[0.2em] text-primary border-b-2 border-secondary pb-1 hover:text-secondary transition-colors"
          >
            Ver todo el catálogo →
          </Link>
        </div>
        {listings.length <= restoDesde ? (
          <div className="border border-dashed border-border py-16 text-center">
            <p className="text-muted-foreground">
              {departamento
                ? `Aún no hay más avisos publicados en ${departamento.nombre}.`
                : "Aún no hay avisos publicados."}
            </p>
            <Link to="/dashboard/anunciante/publicar" className="text-sm font-bold text-secondary hover:underline mt-2 inline-block">
              Publica el primero →
            </Link>
          </div>
        ) : (
          <div ref={semana.ref} className={LISTING_GRID}>
            {listings.slice(restoDesde, restoDesde + semana.count).map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      {/* Map teaser (oculto en móvil para un look más app) */}
      <section className="hidden md:block bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          {/* Fondo decorativo al 20% de opacidad: no necesita calidad alta.
              `auto=format` hace que Unsplash sirva AVIF/WebP (291 KiB -> ~40). */}
          <img
            src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1200&h=450&fit=crop&auto=format&q=55"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/80 to-primary/40" />
        <div className="relative container mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="h-px w-10 bg-secondary" />
              <span className="text-secondary uppercase tracking-[0.25em] font-bold text-[10px]">Búsqueda geográfica</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight uppercase mb-5">
              Explora avisos <span className="text-secondary">en el mapa</span>
            </h2>
            <p className="text-primary-foreground/75 text-base md:text-lg max-w-md leading-relaxed mb-7 font-light">
              Encuentra inmuebles, empleos, vehículos y servicios cerca de ti con vista geográfica interactiva tipo Airbnb y Zillow.
            </p>
            <Link to="/buscar?view=map">
              <Button variant="hero" size="lg" className="gap-2">
                Probar búsqueda <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
          {/* El mapa del Perú con los avisos publicados. `bg-primary/40` es lo
              que se ve mientras llegan las imágenes del mapa. */}
          <div
            ref={mapaRef}
            className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-primary-foreground/15 shadow-2xl bg-primary/40"
          >
            {mapaVisible && (
              <Suspense fallback={null}>
                <PeruMapTeaser listings={listings} />
              </Suspense>
            )}
          </div>
        </div>
      </section>

      {/* Recently published (oculto en móvil para un look más app) */}
      <section className="hidden md:block container mx-auto px-4 py-14 md:py-20">
        <div className="flex items-end justify-between mb-8 md:mb-10 gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-secondary mb-2">
              {departamento ? `Recién publicados en ${departamento.nombre}` : "Recién publicados"}
            </p>
            <h2 className="text-3xl md:text-5xl font-extrabold text-foreground tracking-tight uppercase">Lo más nuevo</h2>
          </div>
          <Link
            to={departamento ? `/buscar?dep=${departamento.id}&sort=new` : "/buscar?sort=new"}
            className="text-xs font-bold uppercase tracking-[0.2em] text-primary border-b-2 border-secondary pb-1 hover:text-secondary transition-colors"
          >
            Ver más recientes →
          </Link>
        </div>
        {/* La tanda siguiente, no la misma de arriba al revés: con menos de 9
            avisos publicados esta sección aún no tiene nada propio que mostrar. */}
        {listings.length <= nuevosDesde ? (
          <div className="border border-dashed border-border py-16 text-center">
            <p className="text-muted-foreground">
              {departamento
                ? `Aún no hay más avisos recientes en ${departamento.nombre}.`
                : "Aún no hay más avisos recientes."}
            </p>
          </div>
        ) : (
          <div ref={nuevos.ref} className={LISTING_GRID}>
            {listings.slice(nuevosDesde, nuevosDesde + nuevos.count).map((listing) => (
              <ListingCard key={`new-${listing.id}`} listing={listing} />
            ))}
          </div>
        )}
      </section>

      {/* Brand trust strip (oculto en móvil para un look más app) */}
      <section className="hidden md:block border-y bg-muted/30">
        <div className="container mx-auto px-4 py-10">
          <p className="text-center text-[10px] uppercase tracking-[0.3em] font-bold text-muted-foreground mb-6">
            Empresas que confían en nosotros
          </p>
          {/* Sin `opacity-60` en el contenedor: combinado con `text-primary/70`
              el texto quedaba en ~2.44:1, por debajo del 4.5:1 de WCAG AA
              (IT2-002). A opacidad plena, `text-primary/70` da ~5.1:1. */}
          <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-4">
            {["FERREYROS", "VOLVO", "RIMAC", "BCP", "INTERBANK", "ENTEL", "BACKUS"].map((b) => (
              <span key={b} className="font-black text-base md:text-lg tracking-widest text-primary/70">
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works (oculto en móvil para un look más app) */}
      <section id="como-funciona" className="hidden md:block gradient-hero text-primary-foreground py-16 md:py-24 scroll-mt-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-xs uppercase tracking-widest font-bold text-secondary mb-2">Cómo funciona</p>
            <h2 className="text-2xl md:text-4xl font-bold">Tres pasos. Resultados reales.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
            {steps.map((step, i) => (
              <div
                key={step.n}
                className="relative bg-primary-foreground/[0.06] backdrop-blur-md rounded-2xl p-6 md:p-8 border border-primary-foreground/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden"
              >
                <span
                  className="absolute top-2 right-4 font-extrabold text-secondary/20 leading-none select-none pointer-events-none"
                  style={{ fontSize: "80px" }}
                >
                  {step.n}
                </span>
                <div className="relative pt-4">
                  <h3 className="text-lg md:text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-sm text-primary-foreground/75 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link to={session ? loggedCta.to : "/auth?tab=register"}>
              <Button variant="hero" size="lg" className="gap-2">
                {session ? loggedCta.label : "Crear cuenta gratis"} <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials (oculto en móvil para un look más app) */}
      <section className="hidden md:block container mx-auto px-4 py-14 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
          <p className="text-xs uppercase tracking-widest font-bold text-secondary mb-2">Testimonios</p>
          <h2 className="text-2xl md:text-4xl font-bold text-foreground">Confianza que se nota</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-card border rounded-2xl p-6 md:p-7 listing-shadow card-lift">
              <div className="flex items-center gap-2 mb-4 text-secondary">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} size={16} fill="currentColor" />
                  ))}
                </div>
                <span className="text-sm font-semibold text-foreground">{t.rating.toFixed(1)}</span>
              </div>
              <p className="text-sm md:text-base text-foreground leading-relaxed mb-6">
                "{t.quote}"
              </p>
              <div className="flex items-center gap-3 pt-4 border-t">
                <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-base shadow-sm">
                  {t.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA (oculto en móvil para un look más app) */}
      <section className="hidden md:block container mx-auto px-4 pb-14 md:pb-20">
        <div className="relative overflow-hidden rounded-3xl gradient-hero p-8 md:p-14 text-center">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, hsl(24 95% 53% / 0.05) 0%, transparent 60%)",
            }}
          />
          <div className="absolute inset-0 opacity-10">
            <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-secondary blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-accent blur-3xl" />
          </div>
          <div className="relative z-10 max-w-2xl mx-auto">
            <h2 className="text-2xl md:text-4xl font-bold text-primary-foreground mb-4">
              ¿Listo para publicar tu primer aviso?
            </h2>
            <p className="text-primary-foreground/80 mb-8 text-base md:text-lg">
              Únete a miles de empresas y particulares que confían en eFFe Multiclasificados.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to={session ? loggedCta.to : "/auth?tab=register"}>
                <Button variant="hero" size="lg" className="w-full sm:w-auto gap-2">
                  {session ? loggedCta.label : "Empezar gratis"} <ArrowRight size={16} />
                </Button>
              </Link>
              <Link to="/buscar">
                <Button variant="hero-outline" size="lg" className="w-full sm:w-auto">
                  Explorar avisos
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Libro de Reclamaciones (oculto en móvil; presente en web por requisito legal) */}
      <div className="hidden md:block">
        <LibroReclamaciones />
      </div>
      </main>

      {/* Footer (oculto en móvil para un look más app) */}
      <footer className="hidden md:block bg-primary text-primary-foreground py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-10 mb-12">
            <div className="md:col-span-1">
              <div className="mb-5">
                <BrandMark size="lg" variant="light" asLink={false} />
              </div>
              <p className="text-primary-foreground/70 text-sm leading-relaxed">
                La plataforma líder de avisos clasificados en Perú. Conectamos personas y negocios de manera simple, segura y profesional.
              </p>
            </div>
            <div>
              <h2 className="font-semibold mb-5 uppercase text-secondary" style={{ fontSize: "13px", letterSpacing: "0.08em" }}>Plataforma</h2>
              <ul className="space-y-3 text-sm text-primary-foreground/70">
                <li><Link to="/buscar" className="hover:text-secondary transition-colors">Explorar avisos</Link></li>
                <li><Link to="/dashboard/anunciante/publicar" className="hover:text-secondary transition-colors">Publicar aviso</Link></li>
                <li><Link to="/auth" className="hover:text-secondary transition-colors">Iniciar sesión</Link></li>
              </ul>
            </div>
            <div>
              <h2 className="font-semibold mb-5 uppercase text-secondary" style={{ fontSize: "13px", letterSpacing: "0.08em" }}>Empresa</h2>
              {/* "Acerca de" (ancla a esta misma página), "Contacto" (abría el
                  gestor de correo; los datos ya están en la columna de al lado) y
                  "Planes Pro" (llevaba al login) se quitaron en IT3-010. Los dos
                  enlaces legales abrían el MISMO diálogo, así que queda uno. */}
              <ul className="space-y-3 text-sm text-primary-foreground/70">
                <li><button type="button" onClick={() => setTermsOpen(true)} className="hover:text-secondary transition-colors text-left">Términos y condiciones</button></li>
              </ul>
            </div>
            <div>
              <h2 className="font-semibold mb-5 uppercase text-secondary" style={{ fontSize: "13px", letterSpacing: "0.08em" }}>Contacto</h2>
              <ul className="space-y-3 text-sm text-primary-foreground/70">
                {/* El correo real de la empresa. El que había (info@effemulticlasificados.pe)
                    era de relleno y no existe: quien escribiera ahí no llegaba a nadie.
                    El teléfono fijo "+51 1 234 5678" también era de relleno y se retiró
                    a pedido del cliente; el contacto por voz va por WhatsApp.
                    Va como texto y NO como `mailto:`, igual que en el chat (ad52fbb): en
                    un equipo sin cliente de correo configurado, pulsarlo abre una ventana
                    en blanco o Gmail sin sesión, y el usuario cree que escribió. */}
                <li className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 size={14} className="text-secondary shrink-0" />
                  <span className="min-w-0 break-all">info@coleffe.com</span>
                </li>
                <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-secondary" /> Lima, Perú</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/15 pt-8 flex flex-col sm:flex-row gap-3 justify-between items-center text-sm text-primary-foreground/50">
            <span>© 2026 eFFe Multiclasificados. Todos los derechos reservados.</span>
            <span className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-secondary" /> Plataforma verificada y segura
            </span>
          </div>
        </div>
      </footer>

      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </div>
  );
};

export default Index;
