import { Navbar } from "@/components/Navbar";
import { HeroSearch } from "@/components/HeroSearch";
import { CategoryGrid } from "@/components/CategoryGrid";
import { ListingCard } from "@/components/ListingCard";
import { CountUp } from "@/components/CountUp";
import { featuredListings } from "@/data/mockData";
import heroBg from "@/assets/hero-bg.jpg";
import { ArrowRight, ShieldCheck, Zap, Users, Award, CheckCircle2, Star, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const trustStats = [
  { value: "8,200+", label: "Avisos activos" },
  { value: "150K+", label: "Usuarios registrados" },
  { value: "24/7", label: "Soporte dedicado" },
  { value: "98%", label: "Satisfacción" },
];

const benefits = [
  {
    icon: ShieldCheck,
    title: "Anunciantes verificados",
    desc: "Validamos cada cuenta de empresa con RUC para una experiencia segura y confiable.",
  },
  {
    icon: Zap,
    title: "Publicación inmediata",
    desc: "Tu aviso visible en menos de 2 minutos con herramientas profesionales de difusión.",
  },
  {
    icon: TrendingUp,
    title: "Estadísticas en tiempo real",
    desc: "Mide vistas, contactos y conversiones con un panel claro y accionable.",
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
  return (
    <div className="min-h-screen bg-background">
      {/* Hero — Premium editorial (Volvo style) */}
      <section className="relative min-h-[680px] md:min-h-[780px] flex flex-col gradient-hero overflow-hidden">
        <img
          src={heroBg}
          alt="Marketplace profesional eFFe Multiclasificados"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/85 via-primary/75 to-primary/95" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/70 via-transparent to-primary/40" />
        <div className="absolute inset-0 bg-dot-pattern opacity-30" />

        <Navbar />

        <div className="relative z-10 flex-1 flex items-center">
          <div className="container mx-auto px-4 py-16 md:py-24">
            <div className="max-w-4xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px w-12 bg-secondary" />
                <span className="text-secondary uppercase tracking-[0.28em] font-bold text-[11px]">
                  Multiclasificados eFFe · Perú
                </span>
              </div>

              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[88px] font-extrabold text-primary-foreground mb-6 tracking-tight leading-[0.92] uppercase">
                Donde los <br className="hidden sm:block" />
                negocios <span className="text-secondary">suceden.</span>
              </h1>

              <p className="text-primary-foreground/75 text-base md:text-lg mb-10 max-w-xl leading-relaxed font-light">
                Miles de oportunidades verificadas en inmuebles, vehículos, maquinaria, empleos y servicios. La plataforma profesional para tus operaciones en Perú.
              </p>

              <div className="max-w-3xl">
                <HeroSearch />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mt-12 pt-8 border-t border-primary-foreground/15 max-w-3xl">
                {trustStats.map((s, i) => (
                  <div
                    key={s.label}
                    className={`px-2 ${i > 0 ? "md:border-l border-primary-foreground/15 md:pl-6" : ""}`}
                  >
                    <p className="text-2xl md:text-3xl font-extrabold text-secondary tracking-tight">
                      <CountUp value={s.value} />
                    </p>
                    <p className="text-[11px] md:text-xs text-primary-foreground/65 mt-2 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 hidden md:flex flex-col items-center gap-2 text-primary-foreground/50 text-[10px] uppercase tracking-widest">
          <span>Explorar</span>
          <div className="w-px h-8 bg-primary-foreground/30 animate-pulse" />
        </div>
      </section>

      {/* Categories */}
      <section className="container mx-auto px-4 py-12 md:py-16">
        <div className="text-center max-w-2xl mx-auto mb-8 md:mb-10">
          <p className="text-xs uppercase tracking-widest font-bold text-secondary mb-2">Explora por categoría</p>
          <h2 className="text-2xl md:text-4xl font-bold text-foreground">¿Qué estás buscando hoy?</h2>
        </div>
        <CategoryGrid />
      </section>

      {/* Benefits */}
      <section className="bg-muted/40 border-y">
        <div className="container mx-auto px-4 py-14 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
            <p className="text-xs uppercase tracking-widest font-bold text-secondary mb-2">Por qué elegirnos</p>
            <h2 className="text-2xl md:text-4xl font-bold text-foreground">
              La plataforma profesional para tus operaciones
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8">
            {benefits.map((b) => (
              <div
                key={b.title}
                className="group bg-card rounded-2xl p-6 md:p-8 border shadow-sm card-lift border-l-4 border-l-transparent hover:border-l-secondary"
              >
                <div className="w-12 h-12 md:w-[48px] md:h-[48px] rounded-xl gradient-secondary flex items-center justify-center text-secondary-foreground mb-5 shadow-md">
                  <b.icon size={24} />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-3">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      <section className="container mx-auto px-4 py-14 md:py-20">
        <div className="flex items-end justify-between mb-8 md:mb-10 gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-secondary mb-2">Destacados</p>
            <h2 className="text-2xl md:text-4xl font-bold text-foreground">Avisos destacados de la semana</h2>
          </div>
          <Link to="/buscar">
            <Button variant="outline" className="gap-2">
              Ver todos <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {featuredListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="gradient-hero text-primary-foreground py-16 md:py-24">
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
            <Link to="/auth?tab=register">
              <Button variant="hero" size="lg" className="gap-2">
                Crear cuenta gratis <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="container mx-auto px-4 py-14 md:py-20">
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

      {/* CTA */}
      <section className="container mx-auto px-4 pb-14 md:pb-20">
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
              <Link to="/auth?tab=register">
                <Button variant="hero" size="lg" className="w-full sm:w-auto gap-2">
                  Empezar gratis <ArrowRight size={16} />
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

      {/* Footer */}
      <footer className="bg-primary text-primary-foreground py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-10 mb-12">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-9 h-9 rounded-lg gradient-secondary flex items-center justify-center text-secondary-foreground font-extrabold">
                  eF
                </div>
                <span className="text-lg font-extrabold">
                  eFFe<span className="text-secondary"> Multi</span>
                </span>
              </div>
              <p className="text-primary-foreground/70 text-sm leading-relaxed">
                La plataforma líder de avisos clasificados en Perú. Conectamos personas y negocios de manera simple, segura y profesional.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-5 uppercase text-secondary" style={{ fontSize: "13px", letterSpacing: "0.08em" }}>Plataforma</h4>
              <ul className="space-y-3 text-sm text-primary-foreground/70">
                <li><Link to="/buscar" className="hover:text-secondary transition-colors">Explorar avisos</Link></li>
                <li><Link to="/auth" className="hover:text-secondary transition-colors">Publicar aviso</Link></li>
                <li><Link to="/auth" className="hover:text-secondary transition-colors">Planes Pro</Link></li>
                <li><Link to="/auth" className="hover:text-secondary transition-colors">Iniciar sesión</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-5 uppercase text-secondary" style={{ fontSize: "13px", letterSpacing: "0.08em" }}>Empresa</h4>
              <ul className="space-y-3 text-sm text-primary-foreground/70">
                <li><a href="#" className="hover:text-secondary transition-colors">Acerca de</a></li>
                <li><a href="#" className="hover:text-secondary transition-colors">Contacto</a></li>
                <li><a href="#" className="hover:text-secondary transition-colors">Términos y condiciones</a></li>
                <li><a href="#" className="hover:text-secondary transition-colors">Política de privacidad</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-5 uppercase text-secondary" style={{ fontSize: "13px", letterSpacing: "0.08em" }}>Contacto</h4>
              <ul className="space-y-3 text-sm text-primary-foreground/70">
                <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-secondary" /> info@effemulticlasificados.pe</li>
                <li className="flex items-center gap-2"><CheckCircle2 size={14} className="text-secondary" /> +51 1 234 5678</li>
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
    </div>
  );
};

export default Index;
