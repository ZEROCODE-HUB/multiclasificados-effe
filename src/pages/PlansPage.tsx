import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";

const plans = [
  {
    id: "free",
    name: "Gratis",
    price: "S/ 0",
    period: "/mes",
    tagline: "Para probar la plataforma",
    listings: 3,
    featured: 0,
    features: [
      "Hasta 3 avisos activos",
      "Visibilidad estándar",
      "Soporte por email",
    ],
    cta: "Empezar gratis",
  },
  {
    id: "basic",
    name: "Básico",
    price: "S/ 29",
    period: "/mes",
    tagline: "Ideal para anunciantes ocasionales",
    listings: 15,
    featured: 2,
    features: [
      "Hasta 15 avisos activos",
      "2 avisos destacados al mes",
      "Estadísticas básicas",
      "Soporte prioritario",
    ],
    cta: "Elegir Básico",
  },
  {
    id: "pro",
    name: "Pro",
    price: "S/ 89",
    period: "/mes",
    tagline: "Para negocios profesionales",
    listings: 60,
    featured: 10,
    features: [
      "Hasta 60 avisos activos",
      "10 destacados premium al mes",
      "Estadísticas avanzadas",
      "Sello verificado Pro",
      "Soporte dedicado",
    ],
    cta: "Elegir Pro",
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "A medida",
    period: "",
    tagline: "Para inmobiliarias, concesionarios y RRHH",
    listings: 999,
    featured: 100,
    features: [
      "Avisos ilimitados",
      "Destacados ilimitados",
      "API e integraciones",
      "Account manager exclusivo",
      "SLA garantizado",
    ],
    cta: "Hablar con ventas",
  },
];

const PlansPage = () => {
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromPublish = params.get("from") === "publicar";
  const [selected, setSelected] = useState<string>("pro");

  useEffect(() => {
    if (!session) navigate("/auth?redirect=/planes" + (fromPublish ? "?from=publicar" : ""), { replace: true });
  }, [session, navigate, fromPublish]);

  const handleChoose = (id: string) => {
    setSelected(id);
    const plan = plans.find((p) => p.id === id);
    if (id === "enterprise") {
      toast({ title: "Contacto enviado", description: "Nuestro equipo comercial te escribirá en menos de 24 h." });
      return;
    }
    toast({
      title: `Plan ${plan?.name} seleccionado`,
      description: id === "free"
        ? "¡Listo! Ya puedes publicar tu aviso."
        : `Procesando pago seguro de ${plan?.price}${plan?.period}...`,
    });
    setTimeout(() => navigate("/dashboard/anunciante/avisos"), 1200);
  };

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="gradient-hero text-primary-foreground py-14 md:py-20">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          {fromPublish && (
            <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-secondary mb-3">
              Último paso para publicar
            </p>
          )}
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight uppercase mb-4">
            Elige el plan que <span className="text-secondary">impulsa</span> tus avisos
          </h1>
          <p className="text-primary-foreground/80 text-base md:text-lg font-light max-w-2xl mx-auto">
            Pagas solo por la visibilidad que necesitas. Cancela o cambia de plan cuando quieras.
          </p>
          <div className="flex items-center justify-center gap-6 mt-6 text-xs uppercase tracking-widest text-primary-foreground/70">
            <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-secondary" /> Pago seguro</span>
            <span className="flex items-center gap-2"><Sparkles size={14} className="text-secondary" /> Sin permanencia</span>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-14 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((p) => {
            const isHighlight = p.highlight;
            const isSelected = selected === p.id;
            return (
              <Card
                key={p.id}
                className={`relative flex flex-col border ${
                  isHighlight ? "border-secondary shadow-2xl lg:-translate-y-3" : "border-border"
                } ${isSelected ? "ring-2 ring-secondary" : ""} transition-all hover:shadow-xl`}
              >
                {isHighlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary text-secondary-foreground text-[10px] font-bold uppercase tracking-widest px-3 py-1">
                    Más elegido
                  </span>
                )}
                <CardContent className="p-6 md:p-7 flex flex-col flex-1">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-secondary mb-2">{p.tagline}</p>
                  <h3 className="text-2xl font-extrabold text-foreground tracking-tight mb-4">{p.name}</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-extrabold text-primary tracking-tight">{p.price}</span>
                    {p.period && <span className="text-sm text-muted-foreground">{p.period}</span>}
                  </div>
                  <ul className="space-y-2.5 mb-6 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                        <Check size={16} className="text-secondary mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={isHighlight ? "hero" : "outline"}
                    className="w-full font-semibold rounded-none"
                    onClick={() => handleChoose(p.id)}
                  >
                    {p.cta} <ArrowRight size={14} className="ml-1" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10 max-w-xl mx-auto">
          Todos los planes incluyen verificación de cuenta, panel de gestión y atención humana.
          Pagos procesados de forma segura. Los precios no incluyen IGV.
        </p>
      </section>
    </div>
  );
};

export default PlansPage;
