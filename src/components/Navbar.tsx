import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Search, Menu, X, Heart, MessageSquare, PlusCircle, ChevronDown,
  User, LogIn, UserPlus, Settings, LogOut, ClipboardList,
  BarChart3, Users, Star, CreditCard, Shield,
} from "lucide-react";
import { useState } from "react";
import { categories } from "@/data/mockData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/hooks/useSession";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { NotificationsBell } from "@/components/NotificationsBell";
import { signOut } from "@/lib/auth";
import { BrandMark } from "@/components/BrandMark";
import { MobileBottomNav } from "@/components/MobileBottomNav";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const session = useSession();
  const unread = useUnreadMessages();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/buscar${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    setMobileOpen(false);
  };

  const logout = () => {
    signOut();
    navigate("/");
  };

  const isUser = session && (session.role === "anunciante" || session.role === "buscador");
  const isAdmin = session && (session.role === "admin" || session.role === "superadmin");

  // Items unificados del menú Mi Cuenta
  const accountItems = isUser
    ? [
        { label: "Mis avisos", icon: ClipboardList, to: "/dashboard/anunciante/avisos" },
        { label: "Publicar aviso", icon: PlusCircle, to: "/dashboard/anunciante/publicar" },
        { label: "Postulaciones", icon: Users, to: "/dashboard/anunciante/postulaciones" },
        { label: "Favoritos", icon: Heart, to: "/dashboard/buscador/favoritos" },
        { label: "Búsquedas guardadas", icon: Star, to: "/dashboard/buscador/busquedas" },
        { label: "Panel y estadísticas", icon: BarChart3, to: "/dashboard/anunciante/estadisticas" },
        { label: "Mis comprobantes", icon: CreditCard, to: "/dashboard/anunciante/boletas" },
        { label: "Configuración", icon: Settings, to: "/dashboard/anunciante/configuracion" },
      ]
    : [];

  // Hamburguesa móvil: solo lo NO cubierto por el bottom nav (Inicio, Explorar, Publicar, Mensajes, Mi cuenta)
  const bottomNavCovered = new Set<string>([
    "/dashboard/anunciante/publicar",
    "/dashboard/anunciante", // "Mi cuenta" → Panel
    "/dashboard/buscador",
  ]);
  const mobileOverflow = isUser
    ? accountItems.filter((i) => !bottomNavCovered.has(i.to))
    : [];

  return (
    <>
    <header className="w-full z-50 bg-card border-b border-border sticky top-0 shadow-[0_1px_0_0_hsl(var(--border))]">
      <div className="container mx-auto flex items-center gap-3 lg:gap-8 h-16 md:h-[76px] px-3 md:px-6">
        <BrandMark size="md" />

        <nav className="hidden lg:flex items-center gap-1">
          <Link to="/" className="px-3 py-2 text-sm font-semibold text-foreground hover:text-secondary transition-colors">
            Inicio
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-foreground hover:text-secondary transition-colors outline-none">
              Categorías <ChevronDown size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-card rounded-none">
              {categories.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => navigate(`/buscar?cat=${c.id}`)} className="gap-2 cursor-pointer rounded-none">
                  <c.icon size={14} className="text-secondary" />
                  <span>{c.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to="/buscar" className="px-3 py-2 text-sm font-semibold text-foreground hover:text-secondary transition-colors">
            Explorar
          </Link>
          <Link
            to="/dashboard/anunciante/publicar"
            className="px-3 py-2 text-sm font-semibold text-foreground hover:text-secondary transition-colors"
          >
            Publicar
          </Link>
        </nav>

        <form
          onSubmit={submit}
          className="hidden md:flex flex-1 min-w-0 max-w-xl items-center bg-muted/50 border border-border rounded-none overflow-hidden focus-within:ring-2 focus-within:ring-secondary/30 focus-within:border-secondary/40 focus-within:bg-card transition-all h-11"
        >
          <Search size={16} className="ml-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar inmuebles, vehículos, empleos…"
            className="flex-1 min-w-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" className="shrink-0 whitespace-nowrap px-4 h-full bg-secondary text-secondary-foreground hover:opacity-90 transition-opacity flex items-center justify-center text-xs font-bold uppercase tracking-wider">
            Buscar
          </button>
        </form>

        <div className="hidden md:flex items-center gap-1 ml-auto shrink-0">
          {isUser && (
            <>
              <Link to="/dashboard/buscador/favoritos" className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Favoritos">
                <Heart size={18} />
              </Link>
              <NotificationsBell />
              <Link
                to={session?.role === "buscador" ? "/dashboard/buscador/mensajes" : "/dashboard/anunciante/mensajes"}
                className="relative flex items-center gap-2 px-3 py-1.5 ml-1 border border-border hover:border-secondary/50 hover:bg-muted/50 text-foreground transition-all rounded-none"
                title="Mensajes"
              >
                <MessageSquare size={16} className="text-secondary" />
                <span className="text-xs font-semibold">Mensajes</span>
                {unread > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-secondary text-secondary-foreground rounded-full">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 ml-2 pl-1.5 pr-3 py-1.5 border border-border hover:border-secondary/50 hover:bg-muted/50 transition-all outline-none rounded-none">
              <div className={`w-8 h-8 flex items-center justify-center text-xs font-bold ${
                session ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {session ? session.initials : <User size={14} />}
              </div>
              <div className="flex flex-col items-start leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Mi cuenta</span>
                <span className="text-xs font-semibold text-foreground -mt-0.5">
                  {session ? session.name.split(" ")[0] : "Ingresar"}
                </span>
              </div>
              <ChevronDown size={14} className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-card rounded-none">
              {!session && (
                <>
                  <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Acceso</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate("/auth")} className="gap-2 cursor-pointer rounded-none">
                    <LogIn size={14} className="text-secondary" /> Iniciar sesión
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/auth?tab=register")} className="gap-2 cursor-pointer rounded-none">
                    <UserPlus size={14} className="text-secondary" /> Crear cuenta
                  </DropdownMenuItem>
                </>
              )}

              {isUser && (
                <>
                  <DropdownMenuLabel className="flex items-center gap-2 py-2">
                    <div className="w-9 h-9 bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-bold">
                      {session!.initials}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold text-foreground">{session!.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-secondary font-bold">Mi cuenta</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {accountItems.map((it) => (
                    <DropdownMenuItem key={it.label} onClick={() => navigate(it.to)} className="gap-2 cursor-pointer rounded-none">
                      <it.icon size={14} className="text-muted-foreground" />
                      {it.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="gap-2 cursor-pointer text-destructive rounded-none">
                    <LogOut size={14} /> Cerrar sesión
                  </DropdownMenuItem>
                </>
              )}

              {isAdmin && (
                <>
                  <DropdownMenuLabel className="flex items-center gap-2 py-2">
                    <div className="w-9 h-9 bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      {session!.initials}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold text-foreground">{session!.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-secondary font-bold">
                        {session!.role === "superadmin" ? "Super Admin" : "Administrador"}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(`/dashboard/${session!.role}`)} className="gap-2 cursor-pointer rounded-none">
                    <Shield size={14} /> Ir al panel admin
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} className="gap-2 cursor-pointer text-destructive rounded-none">
                    <LogOut size={14} /> Cerrar sesión
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/dashboard/anunciante/publicar" className="ml-2">
            <Button size="sm" className="gap-1.5 font-semibold rounded-none px-4">
              <PlusCircle size={14} /> Publicar
            </Button>
          </Link>
        </div>

        <Link
          to="/dashboard/anunciante/publicar"
          className="md:hidden ml-auto p-2 text-foreground"
          aria-label="Publicar"
        >
          <PlusCircle size={22} />
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-foreground"
          aria-label="Menú"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-card border-t shadow-lg animate-fade-in">
          <form onSubmit={submit} className="p-3 border-b">
            <div className="flex items-center bg-muted/50 border border-border h-11">
              <Search size={16} className="ml-3 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en EFFE"
                className="flex-1 bg-transparent px-3 text-sm outline-none"
              />
              <button type="submit" className="px-4 h-full bg-secondary text-secondary-foreground text-xs font-bold uppercase">
                Buscar
              </button>
            </div>
          </form>
          <div className="flex flex-col p-2">
            {isUser ? (
              <>
                <p className="px-3 py-2 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                  Mi cuenta
                </p>
                {mobileOverflow.map((it) => (
                  <Link
                    key={it.label}
                    to={it.to}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium hover:bg-muted/50"
                  >
                    <it.icon size={16} className="text-muted-foreground" /> {it.label}
                  </Link>
                ))}
                <div className="border-t my-2" />
                <button
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                  <LogOut size={16} /> Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link to="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium hover:bg-muted/50">
                  Inicio
                </Link>
                <Link to="/buscar" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium hover:bg-muted/50">
                  Explorar
                </Link>
                <div className="border-t my-2" />
                <Link to="/dashboard/anunciante/publicar" onClick={() => setMobileOpen(false)} className="px-3">
                  <Button className="w-full gap-1.5 rounded-none"><PlusCircle size={14} /> Publicar aviso</Button>
                </Link>
                <Link to="/auth" onClick={() => setMobileOpen(false)} className="px-3 mt-2">
                  <Button variant="outline" className="w-full rounded-none">Ingresar</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
    <MobileBottomNav />
    </>
  );
}
