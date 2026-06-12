import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, Menu, X, MapPin, Bell, Heart, MessageSquare, PlusCircle, ChevronDown } from "lucide-react";
import { useState } from "react";
import { categories } from "@/data/mockData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/buscar${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  };

  const linkBase = isHome ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground";

  return (
    <nav className={`w-full z-50 ${isHome ? "absolute top-0 left-0" : "bg-card border-b sticky top-0"}`}>
      {/* Top utility bar (only non-home, only desktop) */}
      {!isHome && (
        <div className="hidden lg:block border-b bg-muted/30">
          <div className="container mx-auto px-4 h-9 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><MapPin size={12} className="text-secondary" /> Enviando a <strong className="text-foreground font-semibold">Lima, Perú</strong></span>
            <div className="flex items-center gap-5">
              <Link to="/auth" className="hover:text-foreground transition-colors">Centro de ayuda</Link>
              <Link to="/auth" className="hover:text-foreground transition-colors">Empresas</Link>
              <Link to="/auth" className="hover:text-foreground transition-colors">Vender en eFFe</Link>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto flex items-center gap-3 md:gap-6 h-16 md:h-20 px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center font-extrabold text-sm ${isHome ? "bg-secondary text-secondary-foreground" : "gradient-secondary text-secondary-foreground"}`}>
            eF
          </div>
          <span className={`hidden sm:inline text-lg md:text-xl font-extrabold tracking-tight ${isHome ? "text-primary-foreground" : "text-primary"}`}>
            eFFe<span className="text-secondary">.</span>
          </span>
        </Link>

        {/* Mega search (only non-home, desktop) */}
        {!isHome && (
          <form
            onSubmit={submit}
            className="hidden md:flex flex-1 max-w-2xl items-stretch bg-card border border-border rounded-full overflow-hidden focus-within:ring-2 focus-within:ring-secondary/40 focus-within:border-secondary/40 transition-all h-11"
          >
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 px-4 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors border-r border-border">
                Categorías <ChevronDown size={12} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-card">
                {categories.map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => navigate(`/buscar?cat=${c.id}`)} className="gap-2">
                    <c.icon size={14} className="text-secondary" />
                    <span>{c.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar inmuebles, vehículos, empleos, servicios..."
              className="flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" className="px-5 bg-secondary text-secondary-foreground hover:opacity-90 transition-opacity flex items-center justify-center">
              <Search size={16} />
            </button>
          </form>
        )}

        {/* Desktop right actions */}
        <div className="hidden md:flex items-center gap-1 lg:gap-2 ml-auto">
          {isHome && (
            <>
              <Link to="/buscar" className={`px-3 py-2 text-sm font-medium transition-colors ${linkBase}`}>Explorar</Link>
              <Link to="/buscar?cat=inmuebles" className={`px-3 py-2 text-sm font-medium transition-colors ${linkBase}`}>Inmuebles</Link>
              <Link to="/buscar?cat=vehiculos" className={`px-3 py-2 text-sm font-medium transition-colors ${linkBase}`}>Vehículos</Link>
              <Link to="/buscar?cat=empleos" className={`px-3 py-2 text-sm font-medium transition-colors ${linkBase}`}>Empleos</Link>
            </>
          )}
          {!isHome && (
            <>
              <button className={`p-2 rounded-full transition-colors hover:bg-muted ${linkBase}`} title="Favoritos">
                <Heart size={18} />
              </button>
              <button className={`p-2 rounded-full transition-colors hover:bg-muted ${linkBase}`} title="Mensajes">
                <MessageSquare size={18} />
              </button>
              <button className={`p-2 rounded-full transition-colors hover:bg-muted relative ${linkBase}`} title="Notificaciones">
                <Bell size={18} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary" />
              </button>
            </>
          )}

          <Link to="/auth?tab=register" className="ml-1">
            <Button variant={isHome ? "hero" : "default"} size="sm" className="gap-1.5 font-semibold">
              <PlusCircle size={14} /> Publicar
            </Button>
          </Link>
          <Link to="/auth">
            <Button variant={isHome ? "hero-outline" : "outline"} size="sm">
              Ingresar
            </Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className={`md:hidden p-2 ml-auto ${isHome ? "text-primary-foreground" : "text-foreground"}`}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-card border-b shadow-lg animate-fade-in">
          <form onSubmit={submit} className="p-4 border-b">
            <div className="flex items-center bg-muted/50 rounded-full overflow-hidden h-11">
              <Search size={16} className="ml-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en eFFe"
                className="flex-1 bg-transparent px-3 text-sm outline-none"
              />
            </div>
          </form>
          <div className="flex flex-col p-2">
            {categories.slice(0, 6).map((c) => (
              <Link key={c.id} to={`/buscar?cat=${c.id}`} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium hover:bg-muted/50 rounded-lg">
                <c.icon size={16} className="text-secondary" />
                {c.name}
              </Link>
            ))}
            <div className="border-t my-2" />
            <Link to="/auth?tab=register" onClick={() => setMobileOpen(false)} className="px-3">
              <Button className="w-full gap-1.5"><PlusCircle size={14} /> Publicar aviso</Button>
            </Link>
            <Link to="/auth" onClick={() => setMobileOpen(false)} className="px-3 mt-2">
              <Button variant="outline" className="w-full">Ingresar</Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
