import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, Menu, X } from "lucide-react";
import { useState } from "react";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <nav className={`w-full z-50 ${isHome ? "absolute top-0 left-0" : "bg-card border-b"}`}>
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className={`text-xl font-extrabold tracking-tight ${isHome ? "text-primary-foreground" : "text-primary"}`}>
            eFFe<span className="text-secondary"> Multi</span>clasificados
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link to="/buscar" className={`text-sm font-medium hover:text-secondary transition-colors ${isHome ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            Explorar
          </Link>
          <Link to="/auth" className={`text-sm font-medium hover:text-secondary transition-colors ${isHome ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            Publicar aviso
          </Link>
          <Link to="/auth">
            <Button variant={isHome ? "hero-outline" : "outline"} size="sm">
              Iniciar sesión
            </Button>
          </Link>
          <Link to="/auth?tab=register">
            <Button variant={isHome ? "hero" : "default"} size="sm">
              Registrarse
            </Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={`md:hidden p-2 ${isHome ? "text-primary-foreground" : "text-foreground"}`}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-card border-b shadow-lg animate-fade-in">
          <div className="flex flex-col gap-2 p-4">
            <Link to="/buscar" className="text-sm font-medium text-foreground py-2" onClick={() => setMobileOpen(false)}>
              Explorar
            </Link>
            <Link to="/auth" className="text-sm font-medium text-foreground py-2" onClick={() => setMobileOpen(false)}>
              Publicar aviso
            </Link>
            <Link to="/auth" onClick={() => setMobileOpen(false)}>
              <Button variant="outline" className="w-full">Iniciar sesión</Button>
            </Link>
            <Link to="/auth?tab=register" onClick={() => setMobileOpen(false)}>
              <Button className="w-full">Registrarse</Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
