import { Navbar } from "@/components/Navbar";
import { HeroSearch } from "@/components/HeroSearch";
import { CategoryGrid } from "@/components/CategoryGrid";
import { ListingCard } from "@/components/ListingCard";
import { featuredListings } from "@/data/mockData";
import heroBg from "@/assets/hero-bg.jpg";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative min-h-[520px] flex items-center justify-center gradient-hero overflow-hidden">
        <img
          src={heroBg}
          alt="Marketplace"
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <Navbar />
        <div className="relative z-10 text-center px-4 pt-20 pb-12">
          <h1 className="text-3xl md:text-5xl font-extrabold text-primary-foreground mb-4 tracking-tight uppercase">
            Encuentra lo que necesitas
          </h1>
          <p className="text-primary-foreground/80 text-lg md:text-xl mb-8 max-w-2xl mx-auto">
            Miles de avisos clasificados en un solo lugar. Compra, vende y conecta fácilmente.
          </p>
          <HeroSearch />
        </div>
      </section>

      {/* Categories */}
      <section className="container mx-auto px-4 -mt-8 relative z-20">
        <CategoryGrid />
      </section>

      {/* Featured Listings */}
      <section className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-foreground">Avisos Destacados</h2>
          <Link to="/buscar">
            <Button variant="ghost" className="text-secondary">
              Ver todos <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="gradient-hero text-primary-foreground py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-3">eFFe Multiclasificados</h3>
              <p className="text-primary-foreground/70 text-sm">La plataforma líder de avisos clasificados. Conectamos personas y negocios de manera simple y efectiva.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Enlaces</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/70">
                <li><a href="#" className="hover:text-secondary transition-colors">Acerca de</a></li>
                <li><a href="#" className="hover:text-secondary transition-colors">Contacto</a></li>
                <li><a href="#" className="hover:text-secondary transition-colors">Términos y condiciones</a></li>
                <li><a href="#" className="hover:text-secondary transition-colors">Política de privacidad</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Contacto</h4>
              <ul className="space-y-2 text-sm text-primary-foreground/70">
                <li>info@effemulticlasificados.pe</li>
                <li>+51 1 234 5678</li>
                <li>Lima, Perú</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-primary-foreground/20 mt-8 pt-6 text-center text-sm text-primary-foreground/50">
            © 2026 eFFe Multiclasificados. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
