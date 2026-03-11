import { Button } from "@/components/ui/button";
import authBg from "@/assets/auth-bg.jpg";
import { Link, useNavigate } from "react-router-dom";
import { Megaphone, Search, ArrowRight } from "lucide-react";

const AuthPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex">
      {/* Left side - Full background image with overlay */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12">
        <img
          src={authBg}
          alt="Marketplace profesional"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/60" />
        <div className="relative z-10 text-center max-w-lg">
          <h2 className="text-4xl font-extrabold text-primary-foreground mb-4 uppercase tracking-tight">
            eFFe Multiclasificados
          </h2>
          <p className="text-primary-foreground/90 text-lg mb-2">
            La plataforma donde comprar, vender y conectar es más fácil que nunca.
          </p>
          <p className="text-primary-foreground/60 text-sm">
            Miles de oportunidades te esperan. Ingresa como anunciante o buscador para explorar.
          </p>
        </div>
      </div>

      {/* Right side - Demo access */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-background">
        <div className="w-full max-w-md">
          <Link to="/" className="block mb-10">
            <span className="text-2xl font-extrabold text-primary">
              eFFe<span className="text-secondary"> Multi</span>clasificados
            </span>
          </Link>

          <h1 className="text-2xl font-bold text-foreground mb-2">
            Explora la plataforma
          </h1>
          <p className="text-muted-foreground mb-8">
            Selecciona un perfil demo para conocer las funcionalidades de cada rol.
          </p>

          <div className="space-y-4">
            {/* Demo Anunciante */}
            <button
              onClick={() => navigate("/dashboard/anunciante")}
              className="w-full group relative overflow-hidden rounded-xl border-2 border-secondary/30 hover:border-secondary p-6 text-left transition-all duration-300 hover:shadow-lg hover:shadow-secondary/10 bg-card"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-secondary/10 text-secondary group-hover:bg-secondary group-hover:text-secondary-foreground transition-colors">
                  <Megaphone size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground mb-1">Demo Anunciante</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Publica avisos, gestiona tus listados, revisa postulaciones y mensajes de interesados.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary/10 text-secondary font-medium">Publicar avisos</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary/10 text-secondary font-medium">Mensajes</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-secondary/10 text-secondary font-medium">Estadísticas</span>
                  </div>
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-secondary transition-colors mt-1" size={20} />
              </div>
            </button>

            {/* Demo Buscador */}
            <button
              onClick={() => navigate("/dashboard/buscador")}
              className="w-full group relative overflow-hidden rounded-xl border-2 border-primary/30 hover:border-primary p-6 text-left transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 bg-card"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Search size={28} />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground mb-1">Demo Buscador</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Explora avisos, guarda favoritos, contacta anunciantes y gestiona tus búsquedas.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">Buscar avisos</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">Favoritos</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">Contactar</span>
                  </div>
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-primary transition-colors mt-1" size={20} />
              </div>
            </button>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-8">
            Este es un prototipo de demostración. Los datos mostrados son ficticios.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
