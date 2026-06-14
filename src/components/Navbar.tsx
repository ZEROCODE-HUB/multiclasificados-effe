import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Search, Menu, X, MapPin, Bell, Heart, MessageSquare, PlusCircle, ChevronDown,
  User, LogIn, UserPlus, LayoutDashboard, Settings, LogOut, ClipboardList,
  BarChart3, Users, Star, CreditCard, Shield,
  type LucideIcon,
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
import { clearSession, useSession, type SessionRole } from "@/hooks/useSession";

type AccountItem = { label: string; icon: LucideIcon; to: string };

const accountMenus: Record<"anunciante" | "buscador", { label: string; items: AccountItem[] }> = {
  anunciante: {
    label: "Panel anunciante",
    items: [
      { label: "Mi panel", icon: LayoutDashboard, to: "/dashboard/anunciante" },
      { label: "Mis avisos", icon: ClipboardList, to: "/dashboard/anunciante/avisos" },
      { label: "Publicar aviso", icon: PlusCircle, to: "/dashboard/anunciante/publicar" },
      { label: "Mensajes", icon: MessageSquare, to: "/dashboard/anunciante/mensajes" },
      { label: "Postulaciones", icon: Users, to: "/dashboard/anunciante/postulaciones" },
      { label: "Estadísticas", icon: BarChart3, to: "/dashboard/anunciante/estadisticas" },
      { label: "Pagos y facturación", icon: CreditCard, to: "/dashboard/anunciante/configuracion?tab=pagos" },
      { label: "Configuración", icon: Settings, to: "/dashboard/anunciante/configuracion" },
    ],
  },
  buscador: {
    label: "Panel buscador",
    items: [
      { label: "Mi panel", icon: LayoutDashboard, to: "/dashboard/buscador" },
      { label: "Favoritos", icon: Heart, to: "/dashboard/buscador/favoritos" },
      { label: "Búsquedas guardadas", icon: Star, to: "/dashboard/buscador/busquedas" },
      { label: "Alertas", icon: Bell, to: "/dashboard/buscador/alertas" },
      { label: "Mensajes", icon: MessageSquare, to: "/dashboard/buscador/mensajes" },
      { label: "Pagos", icon: CreditCard, to: "/dashboard/buscador/configuracion?tab=pagos" },
      { label: "Configuración", icon: Settings, to: "/dashboard/buscador/configuracion" },
    ],
  },
};

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const session = useSession();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/buscar${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  };

  const logout = () => {
    clearSession();
    navigate("/");
  };

  const isUser = session && (session.role === "anunciante" || session.role === "buscador");
  const menu = isUser ? accountMenus[session.role as "anunciante" | "buscador"] : null;

  return (
    <header className="w-full z-50 bg-card border-b border-border sticky top-0 shadow-[0_1px_0_0_hsl(var(--border))]">
      {/* Top utility bar */}
      <div className="hidden lg:block border-b border-border/60 bg-muted/30">
        <div className="container mx-auto px-6 h-9 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><MapPin size={12} className="text-secondary" /> Enviando a <strong className="text-foreground font-semibold">Lima, Perú</strong></span>
          <div className="flex items-center gap-6">
            <Link to="/auth" className="hover:text-foreground transition-colors">Centro de ayuda</Link>
            <Link to="/auth" className="hover:text-foreground transition-colors">Empresas</Link>
            <Link to="/auth" className="hover:text-foreground transition-colors">Vender en eFFe</Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto flex items-center gap-4 md:gap-8 h-16 md:h-[72px] px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-md gradient-secondary text-secondary-foreground flex items-center justify-center font-extrabold text-sm">
            eF
          </div>
          <span className="text-lg md:text-xl font-extrabold tracking-tight text-primary">
            eFFe<span className="text-secondary">.</span>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          <Link to="/" className="px-3 py-2 text-sm font-semibold text-foreground hover:text-secondary transition-colors">
            Inicio
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-foreground hover:text-secondary transition-colors outline-none">
              Categorías <ChevronDown size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-card">
              {categories.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => navigate(`/buscar?cat=${c.id}`)} className="gap-2 cursor-pointer">
                  <c.icon size={14} className="text-secondary" />
                  <span>{c.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link to="/buscar" className="px-3 py-2 text-sm font-semibold text-foreground hover:text-secondary transition-colors">
            Explorar
          </Link>
          {(!session || session.role === "anunciante") && (
            <Link
              to={session?.role === "anunciante" ? "/dashboard/anunciante/publicar" : "/auth?tab=register"}
              className="px-3 py-2 text-sm font-semibold text-foreground hover:text-secondary transition-colors"
            >
              Publicar
            </Link>
          )}
        </nav>

        <form
          onSubmit={submit}
          className="hidden md:flex flex-1 max-w-xl items-center bg-muted/50 border border-border rounded-full overflow-hidden focus-within:ring-2 focus-within:ring-secondary/30 focus-within:border-secondary/40 focus-within:bg-card transition-all h-11"
        >
          <Search size={16} className="ml-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar inmuebles, vehículos, empleos…"
            className="flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" className="px-4 h-full bg-secondary text-secondary-foreground hover:opacity-90 transition-opacity flex items-center justify-center text-xs font-bold uppercase tracking-wider">
            Buscar
          </button>
        </form>

        <div className="hidden md:flex items-center gap-1 ml-auto">
          {isUser && menu && (
            <>
              <Link to={`/dashboard/${session.role}/${session.role === "buscador" ? "favoritos" : "avisos"}`} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title={session.role === "buscador" ? "Favoritos" : "Mis avisos"}>
                {session.role === "buscador" ? <Heart size={18} /> : <ClipboardList size={18} />}
              </Link>
              <Link to={`/dashboard/${session.role}/mensajes`} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Mensajes">
                <MessageSquare size={18} />
              </Link>
              <Link to={`/dashboard/${session.role}${session.role === "buscador" ? "/alertas" : ""}`} className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted relative transition-colors" title="Notificaciones">
                <Bell size={18} />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-secondary" />
              </Link>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 ml-2 pl-1.5 pr-3 py-1.5 rounded-full border border-border hover:border-secondary/50 hover:bg-muted/50 transition-all outline-none">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                session?.role === "anunciante" ? "bg-secondary text-secondary-foreground" :
                session?.role === "buscador" ? "bg-primary text-primary-foreground" :
                "bg-muted text-muted-foreground"
              }`}>
                {session ? session.initials : <User size={14} />}
              </div>
              <div className="flex flex-col items-start leading-tight">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  {session ? (session.role === "anunciante" ? "Anunciante" : session.role === "buscador" ? "Buscador" : "Cuenta") : "Mi cuenta"}
                </span>
                <span className="text-xs font-semibold text-foreground -mt-0.5">
                  {session ? session.name.split(" ")[0] : "Ingresar"}
                </span>
              </div>
              <ChevronDown size={14} className="text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-card">
              {!session && (
                <>
                  <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Acceso</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate("/auth")} className="gap-2 cursor-pointer">
                    <LogIn size={14} className="text-secondary" /> Iniciar sesión
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/auth?tab=register")} className="gap-2 cursor-pointer">
                    <UserPlus size={14} className="text-secondary" /> Crear cuenta
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Demo</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate("/auth")} className="gap-2 cursor-pointer text-xs text-muted-foreground">
                    Probar como Anunciante o Buscador
                  </DropdownMenuItem>
                </>
              )}

              {isUser && menu && (
                <>
                  <DropdownMenuLabel className="flex items-center gap-2 py-2">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                      session.role === "anunciante" ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground"
                    }`}>
                      {session.initials}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold text-foreground">{session.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-secondary font-bold">{menu.label}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {menu.items.map((it) => (
                    <DropdownMenuItem key={it.to} onClick={() => navigate(it.to)} className="gap-2 cursor-pointer">
                      <it.icon size={14} className="text-muted-foreground" />
                      {it.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      import("@/hooks/useSession").then(({ setSession }) =>
                        setSession(session.role === "anunciante" ? "buscador" : "anunciante")
                      );
                      navigate(`/dashboard/${session.role === "anunciante" ? "buscador" : "anunciante"}`);
                    }}
                    className="gap-2 cursor-pointer text-xs"
                  >
                    <Users size={14} /> Cambiar a {session.role === "anunciante" ? "Buscador" : "Anunciante"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} className="gap-2 cursor-pointer text-destructive">
                    <LogOut size={14} /> Cerrar sesión
                  </DropdownMenuItem>
                </>
              )}

              {session && (session.role === "admin" || session.role === "superadmin") && (
                <>
                  <DropdownMenuLabel className="flex items-center gap-2 py-2">
                    <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                      {session.initials}
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold text-foreground">{session.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-secondary font-bold">
                        {session.role === "superadmin" ? "Super Admin" : "Administrador"}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate(`/dashboard/${session.role}`)} className="gap-2 cursor-pointer">
                    <Shield size={14} /> Ir al panel admin
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={logout} className="gap-2 cursor-pointer text-destructive">
                    <LogOut size={14} /> Cerrar sesión
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {(!session || session.role === "anunciante") && (
            <Link to={session?.role === "anunciante" ? "/dashboard/anunciante/publicar" : "/auth?tab=register"} className="ml-2">
              <Button size="sm" className="gap-1.5 font-semibold rounded-full px-4">
                <PlusCircle size={14} /> Publicar
              </Button>
            </Link>
          )}
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 ml-auto text-foreground"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-card border-t shadow-lg animate-fade-in">
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
            {isUser && menu ? (
              <>
                {menu.items.slice(0, 5).map((it) => (
                  <Link key={it.to} to={it.to} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium hover:bg-muted/50 rounded-lg">
                    <it.icon size={16} className="text-muted-foreground" /> {it.label}
                  </Link>
                ))}
                <button onClick={() => { logout(); setMobileOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg">
                  <LogOut size={16} /> Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link to="/auth?tab=register" onClick={() => setMobileOpen(false)} className="px-3">
                  <Button className="w-full gap-1.5"><PlusCircle size={14} /> Publicar aviso</Button>
                </Link>
                <Link to="/auth" onClick={() => setMobileOpen(false)} className="px-3 mt-2">
                  <Button variant="outline" className="w-full">Ingresar</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
